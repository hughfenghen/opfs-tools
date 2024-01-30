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

  async createWriter(initOffset?: number) {
    await this.initReady
    let offset = initOffset ?? 0
    return {
      write: async (data: ArrayBuffer | ArrayBufferView) => {
        const len = data.byteLength
        const rs = await this.accessHandle?.write(data, {
          at: offset
        })
        offset += len
        return rs
      },
      close: async () => {
        await this.accessHandle?.flush()
      }
    }
  }

  async append(data: ArrayBuffer | ArrayBufferView) {
    await this.initReady
    await this.accessHandle?.write(data, {
      at: await this.getSize(),
      flush: true
    })
  }
}