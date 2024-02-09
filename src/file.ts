import { OPFSWorkerAccessHandle, createOPFSAccess } from './access-worker';
import { getFSHandle, splitDirAndFile } from './common';

class OPFSWrapFile {
  constructor(private filePath: string) {}

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
          const fh = (await getFSHandle(this.filePath, {
            create: true,
            isFile: true,
          })) as FileSystemFileHandle;

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
      (await getFSHandle(this.filePath, {
        create: false,
        isFile: true,
      })) instanceof FileSystemFileHandle
    );
  }

  async remove() {
    const { dirPath, fileName } = splitDirAndFile(this.filePath, true);
    const dirHandle = (await getFSHandle(dirPath, {
      create: false,
      isFile: false,
    })) as FileSystemDirectoryHandle | null;
    if (dirHandle == null) return;

    await dirHandle.removeEntry(fileName);
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
