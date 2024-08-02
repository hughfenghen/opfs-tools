import { getFSHandle, joinPath, parsePath, remove } from './common';
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
  get kind(): 'dir' {
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
    for (const it of await this.children()) {
      try {
        await it.remove();
      } catch (err) {
        console.warn(err);
      }
    }
    try {
      await remove(this.#path);
    } catch (err) {
      console.warn(err);
    }
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
   * If the dest folder exists, copy the current directory into the dest folder;
   * if the dest folder does not exist, rename the current directory to dest name.
   */
  async copyTo(dest: OPFSDirWrap) {
    if (!(await this.exists())) {
      throw Error(`dir ${this.path} not exists`);
    }
    const newDir = (await dest.exists())
      ? dir(joinPath(dest.path, this.name))
      : dest;
    await newDir.create();
    await Promise.all((await this.children()).map((it) => it.copyTo(newDir)));

    return newDir;
  }

  /**
   * move directory, copy then remove current
   */
  async moveTo(dest: OPFSDirWrap): Promise<OPFSDirWrap> {
    const newDir = await this.copyTo(dest);
    await this.remove();

    return newDir;
  }
}
