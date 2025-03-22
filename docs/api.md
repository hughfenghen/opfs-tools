# API

The "opfs-tools" library provides three entry functions: "file," "write," and "dir," for accessing files and directories.

```ts
import { file, write, dir } from 'opfs-tools';
import type { OTFile, OTDir } from 'opfs-tools';
```

## file

```ts
import { OTDir, dir } from './directory';
/**
 * Retrieves a file wrapper instance for the specified file path.
 * @param {string} filePath - The path of the file.
 * @param {'r' | 'rw' | 'rw-unsafe'} mode - A string specifying the locking mode for the access handle. The default value is "rw"
 * return A OTFile instance.
 *
 * @see [MDN createSyncAccessHandle](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createSyncAccessHandle)
 *
 * @example
 * // Read content from a file
  const fileContent = await file('/path/to/file.txt', 'r').text();
  console.log('File content:', fileContent);

  // Check if a file exists
  const fileExists = await file('/path/to/file.txt').exists();
  console.log('File exists:', fileExists);

  // Remove a file
  await file('/path/to/file.txt').remove();
 */
export declare function file(filePath: string, mode?: ShortOpenMode): OTFile;
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
export declare function write(target: string | OTFile, content: string | BufferSource | ReadableStream<BufferSource> | OTFile, opts?: {
    overwrite: boolean;
}): Promise<void>;
type ShortOpenMode = 'r' | 'rw' | 'rw-unsafe';
/**
 * Represents a wrapper for interacting with a file in the filesystem.
 */
export declare class OTFile {
    #private;
    get kind(): 'file';
    get path(): string;
    get name(): string;
    get parent(): ReturnType<typeof dir> | null;
    constructor(filePath: string, mode: ShortOpenMode);
    /**
     * Random write to file
     */
    createWriter(): Promise<{
        write: (chunk: string | BufferSource, opts?: {
            at?: number;
        }) => Promise<number>;
        truncate: (size: number) => Promise<void>;
        flush: () => Promise<void>;
        close: () => Promise<void>;
    }>;
    /**
     * Random access to file
     */
    createReader(): Promise<{
        read: (size: number, opts?: {
            at?: number;
        }) => Promise<ArrayBuffer>;
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
    copyTo(target: OTDir | OTFile | FileSystemFileHandle): Promise<void>;
    /**
     * move file, copy then remove current
     */
    moveTo(target: OTDir | OTFile): Promise<void>;
}
```

## directory

```ts
import { OTFile } from './file';
declare global {
    interface FileSystemDirectoryHandle {
        keys: () => AsyncIterable<string>;
        values: () => AsyncIterable<FileSystemDirectoryHandle | FileSystemFileHandle>;
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
export declare function dir(dirPath: string): OTDir;
export declare class OTDir {
    #private;
    get kind(): 'dir';
    get name(): string;
    get path(): string;
    get parent(): OTDir | null;
    constructor(dirPath: string);
    /**
     * Creates the directory.
     * return A promise that resolves when the directory is created.
     */
    create(): Promise<OTDir>;
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
    children(): Promise<Array<OTDir | OTFile>>;
    /**
     * If the dest folder exists, copy the current directory into the dest folder;
     * if the dest folder does not exist, rename the current directory to dest name.
     */
    copyTo(dest: OTDir | FileSystemDirectoryHandle): Promise<void>;
    /**
     * move directory, copy then remove current
     */
    moveTo(dest: OTDir): Promise<void>;
}
```

## tmpfile

```ts
import { OTFile } from './file';
/**
 * Create a temporary file that will automatically be cleared to avoid occupying too much storage space.
 * The temporary file name will be automatically generated and stored in a specific directory.
 */
export declare function tmpfile(): OTFile;
```
