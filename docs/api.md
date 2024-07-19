# API

The "opfs-tools" library provides three entry functions: "file," "write," and "dir," for accessing files and directories.

```ts
import { file, write, dir } from 'opfs-tools';
```

## file

```ts
import { OPFSDirWrap, dir } from './directory';
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
export declare function file(filePath: string): OPFSFileWrap;
/**
 * Writes content to the specified file.
 * @param {string} target - The path of the file.
 * @param {string | BufferSource | ReadableStream<BufferSource>} content - The content to write to the file.
 * return A promise that resolves when the content is written to the file.
 *
 * @example
 * // Write content to a file
   await write('/path/to/file.txt', 'Hello, world!');
 */
export declare function write(
  target: string | OPFSFileWrap,
  content: string | BufferSource | ReadableStream<BufferSource> | OPFSFileWrap,
  opts?: {
    overwrite: boolean;
  }
): Promise<void>;
/**
 * Represents a wrapper for interacting with a file in the filesystem.
 */
export declare class OPFSFileWrap {
  #private;
  get kind(): 'file';
  get path(): string;
  get name(): string;
  get parent(): ReturnType<typeof dir> | null;
  constructor(filePath: string);
  /**
   * Random write to file
   */
  createWriter(): Promise<{
    write: (
      chunk: string | BufferSource,
      opts?: {
        at?: number;
      }
    ) => Promise<number>;
    truncate: (size: number) => Promise<void>;
    flush: () => Promise<void>;
    close: () => Promise<void>;
  }>;
  /**
   * Random access to file
   */
  createReader(): Promise<{
    read: (
      size: number,
      opts?: {
        at?: number;
      }
    ) => Promise<ArrayBuffer>;
    getSize: () => Promise<number>;
    close: () => Promise<void>;
  }>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  stream(): Promise<ReadableStream<Uint8Array>>;
  getOriginFile(): Promise<File | undefined>;
  getSize(): Promise<number>;
  exists(): Promise<boolean>;
  remove(): Promise<void>;
  /**
   * If the target is a file, use current overwrite the target;
   * if the target is a folder, copy the current file into that folder.
   */
  copyTo(target: OPFSDirWrap | OPFSFileWrap): Promise<OPFSFileWrap>;
  /**
   * move file, copy then remove current
   */
  moveTo(target: OPFSDirWrap | OPFSFileWrap): Promise<OPFSFileWrap>;
}
```

## directory

```ts
import { OPFSFileWrap } from './file';
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
export declare function dir(dirPath: string): OPFSDirWrap;
export declare class OPFSDirWrap {
  #private;
  get kind(): 'dir';
  get name(): string;
  get path(): string;
  get parent(): OPFSDirWrap | null;
  constructor(dirPath: string);
  /**
   * Creates the directory.
   * return A promise that resolves when the directory is created.
   */
  create(): Promise<OPFSDirWrap>;
  /**
   * Checks if the directory exists.
   * return A promise that resolves to true if the directory exists, otherwise false.
   */
  exists(): Promise<boolean>;
  /**
   * Removes the directory.
   * return A promise that resolves when the directory is removed.
   */
  remove(): Promise<void>;
  /**
   * Retrieves the children of the directory.
   * return A promise that resolves to an array of objects representing the children.
   */
  children(): Promise<Array<OPFSDirWrap | OPFSFileWrap>>;
  /**
   * If the dest folder exists, copy the current directory into the dest folder;
   * if the dest folder does not exist, rename the current directory to dest name.
   */
  copyTo(dest: OPFSDirWrap): Promise<OPFSDirWrap>;
  /**
   * move directory, copy then remove current
   */
  moveTo(dest: OPFSDirWrap): Promise<OPFSDirWrap>;
}
```

## tmpfile

```ts
import { OPFSFileWrap } from './file';
/**
 * Create a temporary file that will automatically be cleared to avoid occupying too much storage space.
 * The temporary file name will be automatically generated and stored in a specific directory.
 */
export declare function tmpfile(): OPFSFileWrap;
```
