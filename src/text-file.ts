import { OPFSWorkerAccessHandle } from "./access-worker"
import { BaseFile, FileOpts } from "./base-file"

export class TextFile extends BaseFile {

  #txtEC = new TextEncoder()

  constructor(filePath: string, opts: FileOpts = {}) {
    super(filePath, opts)
  }

  lines() {
    let offset = 0
    const txtDC = new TextDecoder()
    const step = 500

    let readDoned = false
    let cacheStr = ''
    async function readNext(accessHandle: OPFSWorkerAccessHandle) {
      if (cacheStr.length === 0 && readDoned) return { value: null, done: true }

      const idx = cacheStr.indexOf('\n')
      if (idx === -1) {
        if (readDoned) {
          const rs = { value: cacheStr, done: false }
          cacheStr = ''
          return rs
        }

        const buf = await accessHandle.read(offset, step)
        readDoned = buf?.byteLength !== step

        offset += buf?.byteLength ?? 0
        cacheStr += txtDC.decode(buf, { stream: !readDoned })

        return readNext(accessHandle)
      }

      const val = cacheStr.slice(0, idx)
      cacheStr = cacheStr.slice(idx + 1)
      return { value: val, done: false }
    }
    return {
      [Symbol.asyncIterator]: () => {
        return {
          next: async () => {
            await this.initReady
            return await readNext(this.accessHandle!)
          }
        }
      }
    }
  }

  async append(str: string) {
    await this.initReady
    await this.accessHandle?.write(
      this.#txtEC.encode(str).buffer,
      { at: await this.getSize() }
    )
  }

  async text() {
    const txtDC = new TextDecoder()
    return txtDC.decode(
      await (await this.getOriginFile())?.arrayBuffer()
    )
  }
}
