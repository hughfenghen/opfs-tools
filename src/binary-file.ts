import { BaseFile, FileOpts } from "./base-file";


export class BinaryFile extends BaseFile {
  constructor(filePath: string, opts: FileOpts = {}) {
    super(filePath, opts)
  }

  async read(offset: number, size: number) {
    await this.initReady
    return await this.accessHandle?.read(offset, size)!
  }

  async write(offset: number, data: ArrayBuffer | ArrayBufferView) {
    await this.initReady
    return await this.accessHandle?.write(data, {
      at: offset
    })!
  }

  async append(data: ArrayBuffer | ArrayBufferView) {
    await this.initReady
    await this.accessHandle?.write(data, {
      at: await this.getSize(),
      flush: true
    })
  }
}