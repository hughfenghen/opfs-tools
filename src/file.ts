import { createOPFSAccess, postToOPFS } from './access-worker';
import { getFSHandle, joinPath, parsePath, remove } from './common';
import { OTDir, dir } from './directory';

const fileCache = new Map<string, OTFile>();
/**
 * Retrieves a file wrapper instance for the specified file path.
 * @param {string} filePath - The path of the file.
 * return A OTFile instance.
 *
 * 同一 tab 内，同一 path 的多个实例共享专用 Worker 中的唯一句柄：
 * 并发 read 自动排队；并发 write 被 Web Locks 拒绝（文件已被锁时抛错）。
 * 注意：createSyncAccessHandle 仅限 Dedicated Worker，句柄不跨 tab 共享；
 * 跨 tab 同时打开同一文件仍受 OPFS 独占锁限制。
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
  const f = fileCache.get(filePath) ?? new OTFile(filePath);
  fileCache.set(filePath, f);
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

// origin 级单写者互斥：writer 创建前必须抢占该文件的 Web Lock，
// 拿不到（已被其它 writer 持有）即抛错。不支持 Web Locks 时用进程内 Set 兜底。
const WRITER_LOCK_PREFIX = 'opfs-tools-writer:';
const localWriteLocks = new Set<string>();

async function acquireWriteLock(path: string): Promise<() => void> {
  const locks = globalThis.navigator?.locks;
  if (locks == null) {
    if (localWriteLocks.has(path))
      throw Error(`file is locked by another writer: ${path}`);
    localWriteLocks.add(path);
    return () => localWriteLocks.delete(path);
  }

  let release: () => void = () => {};
  const granted = await new Promise<boolean>((resolve) => {
    locks
      .request(`${WRITER_LOCK_PREFIX}${path}`, { ifAvailable: true }, (lock) => {
        if (lock == null) {
          resolve(false);
          return;
        }
        resolve(true);
        // 持有锁直到 writer.close() 调用 release。
        return new Promise<void>((r) => {
          release = r;
        });
      })
      .catch(() => resolve(false));
  });
  if (!granted) throw Error(`file is locked by another writer: ${path}`);
  return () => release();
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

  /**
   * Random write to file.
   * 需先获取该文件的全局写锁，文件已被其它 writer 锁定时抛错。
   */
  async createWriter() {
    const releaseLock = await acquireWriteLock(this.#path);

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
          releaseLock();
        },
      };
    } catch (err) {
      releaseLock();
      throw err;
    }
  }

  /**
   * Random access to file.
   * 读不加锁；同一 tab 内共享唯一句柄，并发 read 在 Worker 中自动排队。
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
