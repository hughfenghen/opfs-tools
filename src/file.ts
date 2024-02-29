import { OPFSWorkerAccessHandle, createOPFSAccess } from './access-worker';
import { getFSHandle, parsePath, remove } from './common';
import { OPFSDirWrap, dir } from './directory';

const fileCache = new Map<string, OPFSFileWrap>();
/**
 * Retrieves a file wrapper instance for the specified file path.
 * @param {string} filePath - The path of the file.
 * return A file wrapper instance.
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
  const f = fileCache.get(filePath) ?? new OPFSFileWrap(filePath);
  fileCache.set(filePath, f);
  return f;
}

/**
 * Writes content to the specified file.
 * @param {string} filePath - The path of the file.
 * @param {string | BufferSource | ReadableStream<BufferSource>} content - The content to write to the file.
 * return A promise that resolves when the content is written to the file.
 * 
 * @example
 * // Write content to a file
   await write('/path/to/file.txt', 'Hello, world!');
 */
export async function write(
  filePath: string,
  content: string | BufferSource | ReadableStream<BufferSource> | OPFSFileWrap
) {
  if (content instanceof OPFSFileWrap) {
    await write(filePath, await content.stream());
    return;
  }

  const writer = await file(filePath).createWriter();
  try {
    await writer.truncate(0);
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
export class OPFSFileWrap {
  get kind() {
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
  #parentPath: string | null;
  #name: string;

  constructor(filePath: string) {
    this.#path = filePath;
    const { parent, name } = parsePath(filePath);
    this.#name = name;
    this.#parentPath = parent;
  }

  #getAccessHandle = (() => {
    let referCnt = 0;
    let accPromise: Promise<
      [OPFSWorkerAccessHandle, () => Promise<void>]
    > | null = null;

    return () => {
      referCnt += 1;
      if (accPromise != null) return accPromise;

      return (accPromise = new Promise(async (resolve, reject) => {
        try {
          const fh = (await getFSHandle(this.#path, {
            create: true,
            isFile: true,
          })) as FileSystemFileHandle;

          const accHandle = await createOPFSAccess(this.#path, fh);
          resolve([
            accHandle,
            async () => {
              referCnt -= 1;
              if (referCnt > 0) return;

              accPromise = null;
              await accHandle.close();
            },
          ]);
        } catch (err) {
          reject(err);
        }
      }));
    };
  })();

  #writing = false;
  /**
   * Random write to file
   */
  async createWriter() {
    if (this.#writing) throw Error('Other writer have not been closed');
    this.#writing = true;

    const txtEC = new TextEncoder();

    // append content by default
    const [accHandle, unref] = await this.#getAccessHandle();
    let pos = await accHandle.getSize();
    let closed = false;
    return {
      write: async (
        chunk: string | BufferSource,
        opts: { at?: number } = {}
      ) => {
        if (closed) throw Error('Writer is closed');
        const content = typeof chunk === 'string' ? txtEC.encode(chunk) : chunk;
        const at = opts.at ?? pos;
        const contentSize = content.byteLength;
        await accHandle.write(content, { at });
        pos = at + contentSize;
      },
      truncate: async (size: number) => {
        if (closed) throw Error('Writer is closed');
        await accHandle.truncate(size);
        if (pos > size) pos = size;
      },
      flush: async () => {
        if (closed) throw Error('Writer is closed');
        await accHandle.flush();
      },
      close: async () => {
        if (closed) throw Error('Writer is closed');
        closed = true;
        this.#writing = false;
        await unref();
      },
    };
  }

  /**
   * Random access to file
   */
  async createReader() {
    const [accHandle, unref] = await this.#getAccessHandle();

    let closed = false;
    let pos = 0;
    return {
      read: async (size: number, opts: { at?: number } = {}) => {
        if (closed) throw Error('Reader is closed');
        const offset = opts.at ?? pos;
        const buf = await accHandle.read(offset, size);
        pos = offset + buf.byteLength;
        return buf;
      },
      getSize: async () => {
        if (closed) throw Error('Reader is closed');
        return await accHandle.getSize();
      },
      close: async () => {
        if (closed) throw Error('Reader is closed');
        closed = true;
        await unref();
      },
    };
  }

  async text() {
    return new TextDecoder().decode(await this.arrayBuffer());
  }

  async arrayBuffer() {
    const reader = await this.createReader();
    const buf = await reader.read(await reader.getSize(), { at: 0 });
    await reader.close();
    return buf;
  }

  async stream() {
    const reader = await this.createReader();

    const readLen = 1024;
    return new ReadableStream<ArrayBuffer>({
      pull: async (ctrl) => {
        const buf = await reader.read(readLen);
        if (buf.byteLength === 0) {
          await reader.close();
          ctrl.close();
        }
        ctrl.enqueue(buf);
      },
      cancel: async () => {
        await reader.close();
      },
    });
  }

  async getSize() {
    const reader = await this.createReader();
    const size = await reader.getSize();
    await reader.close();
    return size;
  }

  async exists() {
    return (
      (await getFSHandle(this.#path, {
        create: false,
        isFile: true,
      })) instanceof FileSystemFileHandle
    );
  }

  async remove() {
    await remove(this.#path);
    // fileCache.delete(this.#path);
  }

  /**
   * If the target is a file, move the current file and overwrite the target;
   * if the target is a folder, move the current file into that folder.
   */
  async moveTo(target: OPFSDirWrap | OPFSFileWrap): Promise<OPFSFileWrap> {
    if (!(await this.exists())) {
      throw Error(`file ${this.path} not exists`);
    }
    if (target instanceof OPFSFileWrap) {
      await write(target.path, this);
      await this.remove();
      return file(target.path);
    } else if (target instanceof OPFSDirWrap) {
      return await this.moveTo(file(target.path + '/' + this.name));
    }
    throw Error('Illegal target type');
  }
}
