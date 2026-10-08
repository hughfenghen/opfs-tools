import { createOPFSAccess, postToOPFS } from './access-worker';
import { getFSHandle, joinPath, parsePath, remove } from './common';
import { OTDir, dir } from './directory';

// fileCache 弱引用化：允许无人使用的 OTFile 被 GC；不再强引用导致永驻。
const fileCache = new Map<string, WeakRef<OTFile>>();

// OTFile 被 GC 时的兜底安全网：淘汰缓存 + forceClose 泄漏句柄（heldValue 为纯 path）。
// 单写者互斥由实例级 #writing 承载、随实例 GC 消失，无外部锁可泄漏，故回调无需释放锁。
// 运行时不支持 FinalizationRegistry 时退化为 null（仅失去自动兜底，仍可显式 close）。
const otfileRegistry =
  typeof FinalizationRegistry !== 'undefined'
    ? new FinalizationRegistry<string>((path) => {
        // 缓存淘汰 + 句柄 forceClose：仅当该 path 已无存活 OTFile，
        // 避免「旧实例终结回调晚于同 path 新实例写入」时误删/误关新实例。
        if (fileCache.get(path)?.deref() === undefined) {
          fileCache.delete(path);
          // 终结回调不能 await，fire-and-forget；forceClose 对已关句柄天然 no-op。
          postToOPFS(path, 'forceClose');
        }
      })
    : null;
/**
 * Retrieves a file wrapper instance for the specified file path.
 * @param {string} filePath - The path of the file.
 * return A OTFile instance.
 *
 * @example
 * // Read content from a file
  const fileContent = await file('/path/to/file.txt').text();
  console.log('File content:', fileContent);

  // Check if a file exists
  const fileExists = await file('/path/to/file.txt').exists();
  console.log('File exists:', fileExists);

  // Remove a file
  await file('/path/to/file.txt').remove();
 */
export function file(filePath: string) {
  const cacheF = fileCache.get(filePath)?.deref();
  if (cacheF) return cacheF;
  const f = new OTFile(filePath);
  fileCache.set(filePath, new WeakRef(f));
  // GC 兜底注册下沉到工厂：heldValue 为纯 path，OTFile 被回收时淘汰缓存 + forceClose 句柄。
  otfileRegistry?.register(f, filePath);
  return f;
}

/**
 * Writes content to the specified file.
 * @param {string} target - The path of the file.
 * @param {string | BufferSource | ReadableStream<BufferSource>} content - The content to write to the file.
 * return A promise that resolves when the content is written to the file.
 *
 * @example
 * // Write content to a file
   await write('/path/to/file.txt', 'Hello, world!');
 */
export async function write(
  target: string | OTFile,
  content: string | BufferSource | ReadableStream<BufferSource> | OTFile,
  opts = { overwrite: true }
) {
  if (content instanceof OTFile) {
    await write(target, await content.stream(), opts);
    return;
  }

  const writer = await (target instanceof OTFile
    ? target
    : file(target)
  ).createWriter();
  try {
    if (opts.overwrite) await writer.truncate(0);
    if (content instanceof ReadableStream) {
      const reader = content.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
      }
    } else {
      await writer.write(content);
    }
  } catch (err) {
    throw err;
  } finally {
    await writer.close();
  }
}

/**
 * Represents a wrapper for interacting with a file in the filesystem.
 */
export class OTFile {
  get kind(): 'file' {
    return 'file';
  }

  get path() {
    return this.#path;
  }

  get name() {
    return this.#name;
  }

  get parent(): ReturnType<typeof dir> | null {
    return this.#parentPath == null ? null : dir(this.#parentPath);
  }

  #path: string;
  #parentPath: string;
  #name: string;

  constructor(filePath: string) {
    this.#path = filePath;
    const { parent, name } = parsePath(filePath);
    if (parent == null) throw Error(`Invalid path: ${filePath}`);
    this.#name = name;
    this.#parentPath = parent;
  }

  #writing = false;
  /**
   * Random write to file.
   */
  async createWriter() {
    if (this.#writing)
      throw Error(`file is locked by another writer: ${this.#path}`);
    this.#writing = true;

    try {
      const txtEC = new TextEncoder();

      // append content by default
      const accHandle = await createOPFSAccess(this.#path);
      let pos = await accHandle.getSize();
      let closed = false;
      return {
        write: async (
          chunk: string | BufferSource,
          opts: { at?: number } = {}
        ) => {
          if (closed) throw Error(`Writer is closed: ${this.#path}`);
          const content =
            typeof chunk === 'string' ? txtEC.encode(chunk) : chunk;
          const at = opts.at ?? pos;
          const contentSize = content.byteLength;
          pos = at + contentSize;
          return await accHandle.write(content, { at });
        },
        truncate: async (size: number) => {
          if (closed) throw Error(`Writer is closed: ${this.#path}`);
          await accHandle.truncate(size);
          if (pos > size) pos = size;
        },
        flush: async () => {
          if (closed) throw Error(`Writer is closed: ${this.#path}`);
          await accHandle.flush();
        },
        close: async () => {
          if (closed) throw Error(`Writer is closed: ${this.#path}`);
          closed = true;
          await accHandle.close();
          this.#writing = false;
        },
      };
    } catch (err) {
      this.#writing = false;
      throw err;
    }
  }

  /**
   * Random access to file.
   */
  async createReader() {
    const accHandle = await createOPFSAccess(this.#path);

    let closed = false;
    let pos = 0;
    return {
      read: async (size: number, opts: { at?: number } = {}) => {
        if (closed) throw Error(`Reader is closed: ${this.#path}`);
        const offset = opts.at ?? pos;
        const buf = await accHandle.read(offset, size);
        pos = offset + buf.byteLength;
        return buf;
      },
      getSize: async () => {
        if (closed) throw Error(`Reader is closed: ${this.#path}`);
        return await accHandle.getSize();
      },
      close: async () => {
        if (closed) return;
        closed = true;
        await accHandle.close();
      },
    };
  }

  async text() {
    return new TextDecoder().decode(await this.arrayBuffer());
  }

  async arrayBuffer() {
    const fh = await getFSHandle(this.#path, { create: false, isFile: true });
    if (fh == null) return new ArrayBuffer(0);
    return (await fh.getFile()).arrayBuffer();
  }

  async stream() {
    const ofile = await this.getOriginFile();
    if (ofile == null) {
      return new ReadableStream<Uint8Array>({
        pull: (ctrl) => {
          ctrl.close();
        },
      });
    }

    return ofile.stream();
  }

  async getOriginFile() {
    return (
      await getFSHandle(this.#path, { create: false, isFile: true })
    )?.getFile();
  }

  async getSize() {
    const fh = await getFSHandle(this.#path, { create: false, isFile: true });
    if (fh == null) return 0;
    return (await fh.getFile()).size;
  }

  async exists() {
    return (
      (await getFSHandle(this.#path, {
        create: false,
        isFile: true,
      })) instanceof FileSystemFileHandle
    );
  }

  async remove(opts: { force?: boolean } = {}) {
    if (opts.force === true) {
      // 无视占用计数，强制关闭 Worker 中的句柄后删除。
      await postToOPFS(this.#path, 'forceClose');
      await remove(this.#path);
      fileCache.delete(this.#path);
      return;
    }
    // 占用校验下沉到 Worker：仍有未关闭的 reader/writer 时禁止删除。
    if ((await postToOPFS(this.#path, 'isOpen')) === true)
      throw Error(`exists unclosed reader/writer: ${this.#path}`);
    await remove(this.#path);
  }

  /**
   * If the target is a file, use current overwrite the target;
   * if the target is a folder, copy the current file into that folder.
   */
  async copyTo(target: OTDir | OTFile): Promise<OTFile>;
  async copyTo(target: FileSystemFileHandle): Promise<null>;
  async copyTo<T>(target: T) {
    if (target instanceof OTFile) {
      if (target.path === this.path) return this;

      await write(target, this);
      return target;
    } else if (target instanceof OTDir) {
      if (!(await this.exists())) {
        throw Error(`file ${this.path} not exists`);
      }
      return await this.copyTo(file(joinPath(target.path, this.name)));
    } else if (target instanceof FileSystemFileHandle) {
      await (await this.stream()).pipeTo(await target.createWritable());
      return null;
    }
    throw Error(`Illegal target type, path: ${this.path}`);
  }

  /**
   * move file, copy then remove current
   */
  async moveTo(target: OTDir | OTFile): Promise<OTFile> {
    const newFile = await this.copyTo(target);
    await this.remove();
    return newFile;
  }
}
