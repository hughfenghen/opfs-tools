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
  async #init() {
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
    const writer = await this.createWritable();
    await writer.write(content);
    await writer.close();
  }

  // todo: 独占
  async createWritable() {
    await this.#init();
    const accHandle = this.#accessHandle!;

    const txtEC = new TextEncoder();

    const ws = new WritableStream<string | ArrayBuffer | ArrayBufferView>({
      write: async (chunk) => {
        await accHandle.truncate(0);

        await accHandle.write(
          typeof chunk === 'string' ? txtEC.encode(chunk) : chunk
        );
      },
      close: async () => {
        await this.close();
      },
    });

    return ws.getWriter();
  }

  async text() {
    await this.#init();
    const accHandle = this.#accessHandle!;
    const txtDC = new TextDecoder();
    const rs = txtDC.decode(await accHandle.read(0, await accHandle.getSize()));
    await this.close();
    return rs;
  }

  async close() {
    await this.#init();
    const accHandle = this.#accessHandle!;
    await accHandle.close();
    this.#initPromise = null;
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

export function file(filePath: string) {
  return new OPFSWrapFile(filePath);
}

export async function write(
  filePath: string,
  content: string | ArrayBuffer | ArrayBuffer
) {
  const f = file(filePath);
  await f.write(content);
  await f.close();
}
