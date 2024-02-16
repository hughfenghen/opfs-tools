EN: A simple, high-performance, and comprehensive file system API running in the browser, built on [OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system).

CN: 在浏览器中运行的简单、高性能、完备的文件系统 API，基于 [OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) 构建。

[**API Documentation**](./docs/api.md)

[Benchmark](https://hughfenghen.github.io/opfs-tools/benchmark/)

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
