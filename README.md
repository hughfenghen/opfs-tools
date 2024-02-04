A utility library for simple and efficient file operations in the browser, built on [OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system).

在浏览器中简单、高效操作文件的工具库，基于 [OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) 构建。

In development, will reference the API design of [Bun File I/O](https://bun.sh/docs/api/file-io).

开发中，将参考 Bun File I/O 的 API 设计。

## Features

- [ ] Reading files
  - [x] create file
  - [x] text
  - [ ] stream
  - [x] arrayBuffer
  - [x] file.createReader
- Writing files
  - [x] write string/ArrayBuffer/ArrayBufferView
  - [ ] write Response
  - [ ] write ReadableStream
- Incremental writing with FileSink
  - [x] file.createWriter
  - [x] writer.write
  - [ ] writer.flush
  - [x] writer.close
- Directories
  - [ ] readdir
  - [x] mkdir
  - [x] exists
