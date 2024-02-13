import { getFSHandle, remove } from './common';
import { file, OPFSFileWrap } from './file';

declare global {
  interface FileSystemDirectoryHandle {
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

class OPFSDirWrap {
  get kind() {
    return 'dir';
  }

  #dirPath: string;
  constructor(dirPath: string) {
    this.#dirPath = dirPath;
  }

  /**
   * Creates the directory.
   * return A promise that resolves when the directory is created.
   */
  async create() {
    await getFSHandle(this.#dirPath, {
      create: true,
      isFile: false,
    });
    return dir(this.#dirPath);
  }

  /**
   * Checks if the directory exists.
   * return A promise that resolves to true if the directory exists, otherwise false.
   */
  async exists() {
    return (
      (await getFSHandle(this.#dirPath, {
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
    await remove(this.#dirPath);
  }

  /**
   * Retrieves the children of the directory.
   * return A promise that resolves to an array of objects representing the children.
   */
  async children(): Promise<Array<OPFSDirWrap | OPFSFileWrap>> {
    const handle = (await getFSHandle(this.#dirPath, {
      create: false,
      isFile: false,
    })) as FileSystemDirectoryHandle;
    if (handle == null) return [];

    const rs = [];
    for await (const it of handle.values()) {
      rs.push((it.kind === 'file' ? file : dir)(`${this.#dirPath}/${it.name}`));
    }
    return rs;
  }
}
