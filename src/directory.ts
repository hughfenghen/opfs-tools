import { getFSHandle, parsePath, remove } from './common';
import { file, OPFSFileWrap } from './file';

declare global {
  interface FileSystemDirectoryHandle {
    keys: () => AsyncIterable<string>;
    values: () => AsyncIterable<
      FileSystemDirectoryHandle | FileSystemFileHandle
    >;
  }
}

/**
 * Represents a directory with utility functions.
 * @param {string} dirPath - The path of the directory.
 * @returns  An object with directory utility functions.
 * 
 * @example
  // Create a directory
  await dir('/path/to/directory').create();

  // Check if the directory exists
  const exists = await dir('/path/to/directory').exists();

  // Remove the directory

  // Retrieve children of the directory
  const children = await dir('/path/to/parent_directory').children();
 */
export function dir(dirPath: string) {
  return new OPFSDirWrap(dirPath);
}

export class OPFSDirWrap {
  get kind() {
    return 'dir';
  }

  get name() {
    return this.#name;
  }

  get path() {
    return this.#path;
  }

  get parent(): OPFSDirWrap | null {
    return this.#parentPath == null ? null : dir(this.#parentPath);
  }

  #path: string;
  #name: string;
  #parentPath: string | null;

  constructor(dirPath: string) {
    this.#path = dirPath;
    const { parent, name } = parsePath(dirPath);
    this.#name = name;
    this.#parentPath = parent;
  }

  /**
   * Creates the directory.
   * return A promise that resolves when the directory is created.
   */
  async create() {
    await getFSHandle(this.#path, {
      create: true,
      isFile: false,
    });
    return dir(this.#path);
  }

  /**
   * Checks if the directory exists.
   * return A promise that resolves to true if the directory exists, otherwise false.
   */
  async exists() {
    return (
      (await getFSHandle(this.#path, {
        create: false,
        isFile: false,
      })) instanceof FileSystemDirectoryHandle
    );
  }

  /**
   * Removes the directory.
   * return A promise that resolves when the directory is removed.
   */
  async remove() {
    await remove(this.#path);
  }

  /**
   * Retrieves the children of the directory.
   * return A promise that resolves to an array of objects representing the children.
   */
  async children(): Promise<Array<OPFSDirWrap | OPFSFileWrap>> {
    const handle = (await getFSHandle(this.#path, {
      create: false,
      isFile: false,
    })) as FileSystemDirectoryHandle;
    if (handle == null) return [];

    const rs = [];
    for await (const it of handle.values()) {
      rs.push((it.kind === 'file' ? file : dir)(joinPath(this.#path, it.name)));
    }
    return rs;
  }

  /**
   * If the dest folder exists, move the current directory into the dest folder;
   * if the dest folder does not exist, rename the current directory to dest name.
   */
  async moveTo(dest: OPFSDirWrap): Promise<OPFSDirWrap> {
    if (!(await this.exists())) {
      throw Error(`dir ${this.path} not exists`);
    }

    const newDir = (await dest.exists())
      ? dir(dest.path + '/' + this.name)
      : dest;
    await newDir.create();
    await Promise.all((await this.children()).map((it) => it.moveTo(newDir)));
    await this.remove();

    return newDir;
  }
}

function joinPath(p1: string, p2: string) {
  return `${p1}/${p2}`.replace('//', '/');
}
