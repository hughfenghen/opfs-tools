import { OPFSWorkerAccessHandle, createOPFSAccess } from './access-worker';

export interface FileOpts {
  overwrite?: boolean;
}

async function makeParent(filePath: string) {
  if (!filePath.startsWith('/')) filePath = `/${filePath}`;

  const root = await navigator.storage.getDirectory();
  const paths = filePath.split('/').slice(1, -1);
  let dirHandle;
  for (const p of paths) {
    dirHandle = await root.getDirectoryHandle(p, { create: true });
  }
  return dirHandle ?? root;
}

export abstract class BaseFile {
  name: string;

  protected initReady: Promise<void>;

  protected parent: FileSystemDirectoryHandle | null = null;

  protected accessHandle: OPFSWorkerAccessHandle | null = null;

  #fh: FileSystemFileHandle | null = null;

  constructor(filePath: string, opts: FileOpts = {}) {
    const name = filePath.split('/').at(-1);
    if (name == null || name === '') throw Error('Illegal file name');
    this.name = name;

    this.initReady = this.#init(filePath, opts);
  }

  async #init(filePath: string, opts: FileOpts) {
    const dir = await makeParent(filePath);
    this.parent = dir;
    this.#fh = await dir.getFileHandle(this.name, {
      create: true,
    });

    this.accessHandle = await createOPFSAccess()(filePath, this.#fh);

    if (opts.overwrite === true) await this.accessHandle.truncate(0);
  }

  async getSize() {
    await this.initReady;
    return (await this.accessHandle?.getSize()) ?? 0;
  }

  async truncate(newSize: number) {
    await this.initReady;
    await this.accessHandle?.truncate(newSize);
  }

  async remove() {
    await this.close();
    await this.parent?.removeEntry(this.name);
  }

  /**
   * When a file is no longer in use, it is necessary to call the close method.
   */
  async close() {
    await this.initReady;
    await this.accessHandle?.close();
  }
}
