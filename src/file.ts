import { OPFSWorkerAccessHandle, createOPFSAccess } from './access-worker';
import { mkdirAndReturnHandle } from './directories';

class OPFSWrapFile {
  #dirPath: string;
  #fileName: string;

  #accessHandle: OPFSWorkerAccessHandle | null = null;

  constructor(private filePath: string) {
    const lastDirPos = filePath.lastIndexOf('/');
    this.#dirPath = lastDirPos === -1 ? '/' : filePath.slice(0, lastDirPos);
    this.#fileName =
      lastDirPos === -1 ? filePath : filePath.slice(lastDirPos + 1);
  }

  #initPromise: Promise<void> | null = null;
  #referCnt = 0;
  async #init(needIncRefCnt = true) {
    if (needIncRefCnt) this.#referCnt += 1;
    if (this.#initPromise != null) return await this.#initPromise;

    this.#initPromise = new Promise<void>(async (resolve, reject) => {
      try {
        const dir = await mkdirAndReturnHandle(this.#dirPath);
        const fh = await dir.getFileHandle(this.#fileName, {
          create: true,
        });

        this.#accessHandle = await createOPFSAccess(this.filePath, fh);
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    return await this.#initPromise;
  }

  async #clear() {
    this.#referCnt -= 1;
    if (this.#referCnt > 0) return;

    await this.#init(false);
    this.#initPromise = null;
    await this.#accessHandle!.close();
    this.#accessHandle = null;
  }

  #writing = false;
  async createWriter() {
    if (this.#writing) throw Error('Other writer have not been closed');
    this.#writing = true;

    await this.#init();
    const accHandle = this.#accessHandle!;

    const txtEC = new TextEncoder();

    // append content by default
    let pos = await this.getSize();
    return {
      write: async (chunk: string | BufferSource) => {
        const content = typeof chunk === 'string' ? txtEC.encode(chunk) : chunk;
        await accHandle.write(content, { at: pos });
        pos += content.byteLength;
      },
      seek: (position: number) => {
        pos = position;
      },
      truncate: async (size: number) => {
        await accHandle.truncate(size);
        if (pos > size) pos = size;
      },
      flush: async () => await accHandle.flush(),
      close: async () => {
        this.#writing = false;
        await this.#clear();
      },
    };
  }

  async createReader() {
    await this.#init();
    const accHandle = this.#accessHandle!;

    return {
      read: async (offset: number, size: number) =>
        await accHandle.read(offset, size),
      getSize: async () => await accHandle.getSize(),
      close: async () => await this.#clear(),
    };
  }

  async text() {
    return new TextDecoder().decode(await this.arrayBuffer());
  }

  async arrayBuffer() {
    const reader = await this.createReader();
    const buf = await reader.read(0, await this.#accessHandle!.getSize());
    await reader.close();
    return buf;
  }

  async stream() {
    const reader = await this.createReader();

    const readLen = 1024;
    let pos = 0;
    return new ReadableStream<ArrayBuffer>({
      pull: async (ctrl) => {
        const buf = await reader.read(pos, readLen);
        if (buf.byteLength === 0) {
          await reader.close();
          ctrl.close();
        }
        pos += buf.byteLength;
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
}

// todo: remove file from cache
const fileCache = new Map<string, OPFSWrapFile>();
export function file(filePath: string) {
  const f = fileCache.get(filePath) ?? new OPFSWrapFile(filePath);
  fileCache.set(filePath, f);
  return f;
}

export async function write(
  filePath: string,
  content: string | BufferSource | ReadableStream<BufferSource>
) {
  const writer = await file(filePath).createWriter();
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
  await writer.close();
}
