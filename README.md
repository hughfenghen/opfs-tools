EN: A simple, high-performance, and comprehensive file system API running in the browser, built on [OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system).

CN: 在浏览器中运行的简单、高性能、完备的文件系统 API，基于 [OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) 构建。

[**API Documentation**](./docs/api.md)

[Benchmark](https://hughfenghen.github.io/opfs-tools/demo/benchmark.html)

## Usage

_You can experience the [online demo](https://hughfenghen.github.io/opfs-tools-explorer/) at the [opfs-tools-explorer](https://github.com/hughfenghen/opfs-tools-explorer) project._  
![image](https://github.com/hughfenghen/opfs-tools/assets/3307051/1cf11bc7-92fb-4fde-9a18-5c7e81419e77)


```js
import { file, dir, write } from 'opfs-tools';

// --------- Create / Write ---------
await dir('/test-dir').create(); // create a directory

await write('/dir/file.txt', ''); // empty file
await write('/dir/fetch-file', (await fetch('//example.com')).body);
// inputFile from the input element picked by the user
await write('/dir/input-file', inputFile.stream());

// For incremental file writes, please refer to the API documentation.
const writer = await file('/dir/file').createWriter();

// --------- Read ---------
await file('/dir/file.txt').text();
await file('/dir/input-file').arrayBuffer();
await file('/dir/input-file').stream();

// If you want to read file fragments, please refer to the API documentation.
const reader = await file('/dir/input-file').createReader();

await dir('/test-dir').children();

// --------- Remove ---------
await dir('/test-dir').remove();

await file('/dir/file.txt').remove();

// --------- copyTo / moveTo ---------
await file('/dir/file').copyTo(file('/dir/file copy1'));
await dir('/dir').moveTo(dir('/.Trash'));
```

文章：[Web 文件系统（OPFS 及工具）介绍](https://hughfenghen.github.io/posts/2024/03/14/web-storage-and-opfs/)

## Features

- Basic operations
  - [x] file
    - [x] remove
    - [x] exists
  - [x] dir
    - [x] create
    - [x] remove
    - [x] exists
    - [x] children
- [x] Reading files
  - [x] getSize
  - [x] text
  - [x] stream
  - [x] arrayBuffer
- [x] Random reading
  - [x] reader = file.createReader
  - [x] reader.read(bufLen, { at }
  - [x] reader.close
- Writing files
  - [x] write(dest: string, input: string)
  - [x] write(dest: string, input: ArrayBuffer | ArrayBufferView)
  - [x] write(dest: string, input: ReadableStream)
- Random writing
  - [x] writer = file.createWriter
  - [x] writer.write
  - [x] writer.flush
  - [x] writer.truncate
  - [x] writer.close
