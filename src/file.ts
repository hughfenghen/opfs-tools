import { OPFSWorkerAccessHandle, createOPFSAccess } from './access-worker';
import { mkdir } from './directories';

class OPFSWrapFile {
  get size() {
    return 0;
  }

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
        await mkdir(this.#dirPath);
        const dir = await getDirHandle(this.#dirPath);
        const fh = await dir.getFileHandle(this.#fileName, {
          create: true,
        });

        this.#accessHandle = await createOPFSAccess()(this.filePath, fh);
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    return await this.#initPromise;
  }

  async write(content: string | ArrayBuffer | ArrayBufferView) {
    const writer = await this.createWriter();
    await writer.write(content);
    await writer.close();
  }

  #writing = false;
  async createWriter() {
    if (this.#writing) throw Error('Other writer have not been closed');
    this.#writing = true;

    await this.#init();
    const accHandle = this.#accessHandle!;

    const txtEC = new TextEncoder();

    await accHandle.truncate(0);
    const ws = new WritableStream<string | ArrayBuffer | ArrayBufferView>({
      write: async (chunk) => {
        await accHandle.write(
          typeof chunk === 'string' ? txtEC.encode(chunk) : chunk
        );
      },
      close: async () => {
        this.#writing = false;
        await this.#clear();
      },
    });

    return ws.getWriter();
  }

  async createReader() {
    await this.#init();
    const accHandle = this.#accessHandle!;

    return {
      read: async (offset: number, size: number) => {
        return await accHandle.read(offset, size);
      },
      close: async () => {
        await this.#clear();
      },
    };
  }

  async text() {
    await this.#init();
    const accHandle = this.#accessHandle!;
    const txtDC = new TextDecoder();
    const rs = txtDC.decode(await accHandle.read(0, await accHandle.getSize()));
    await this.#clear();
    return rs;
  }

  async arrayBuffer() {
    await this.#init();
    const accHandle = this.#accessHandle!;
    const buf = await accHandle.read(0, await accHandle.getSize());
    await this.#clear();
    return buf;
  }

  async #clear() {
    this.#referCnt -= 1;
    if (this.#referCnt > 0) return;

    await this.#init(false);
    this.#initPromise = null;
    await this.#accessHandle!.close();
  }
}

async function getDirHandle(dirPath: string) {
  if (!dirPath.startsWith('/')) dirPath = `/${dirPath}`;

  let dirHandle = await navigator.storage.getDirectory();
  const paths = dirPath
    .split('/')
    .slice(1)
    .filter((s) => s.length > 0);

  for (const p of paths) {
    dirHandle = await dirHandle.getDirectoryHandle(p);
  }
  return dirHandle;
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
  content: string | ArrayBuffer | ArrayBuffer
) {
  const f = file(filePath);
  await f.write(content);
}
