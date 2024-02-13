EN: A utility library for simple and efficient file operations in the browser, built on [OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system).

CN: 在浏览器中简单、高效操作文件的工具库，基于 [OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) 构建。

[**API Documentation**](./docs/api.md)

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
