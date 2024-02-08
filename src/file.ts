import { OPFSWorkerAccessHandle, createOPFSAccess } from './access-worker';
import { mkdirAndReturnHandle } from './directories';

class OPFSWrapFile {
  #dirPath: string;
  #fileName: string;

  constructor(private filePath: string) {
    const lastDirPos = filePath.lastIndexOf('/');
    this.#dirPath = lastDirPos === -1 ? '/' : filePath.slice(0, lastDirPos);
    this.#fileName =
      lastDirPos === -1 ? filePath : filePath.slice(lastDirPos + 1);
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
          const dir = await mkdirAndReturnHandle(this.#dirPath);
          const fh = await dir.getFileHandle(this.#fileName, { create: true });

          const accHandle = await createOPFSAccess(this.filePath, fh);
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
  async createWriter() {
    if (this.#writing) throw Error('Other writer have not been closed');
    this.#writing = true;

    const txtEC = new TextEncoder();

    // append content by default
    const [accHandle, unref] = await this.#getAccessHandle();
    let pos = await this.getSize();
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

  async createReader() {
    const [accHandle, unref] = await this.#getAccessHandle();

    let closed = false;
    return {
      read: async (offset: number, size: number) => {
        if (closed) throw Error('Reader is closed');
        return await accHandle.read(offset, size);
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
    const buf = await reader.read(0, await reader.getSize());
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
