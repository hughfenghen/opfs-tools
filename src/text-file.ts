import { OPFSWorkerAccessHandle, createOPFSAccess } from "./access-worker"

const root = await navigator.storage.getDirectory()

async function makeParent(fileName: string) {
  const paths = fileName
    .split('/')
    .filter(s => s.length > 0)
    .slice(0, -1)
  let dirHandle
  for (const p of paths) {
    dirHandle = await root.getDirectoryHandle(p, { create: true })
  }
  return dirHandle ?? root
}

interface FileOpts {
  create?: boolean
  overwrite?: boolean
}

export class TextFile {
  #name: string

  #fh: FileSystemFileHandle | null = null

  #parent: FileSystemDirectoryHandle | null = null

  #initReady: Promise<void>
  #accessHandle: OPFSWorkerAccessHandle | null = null

  #txtEC = new TextEncoder()

  #fileSize = 0

  constructor(fileName: string, opts: FileOpts = {}) {
    const name = fileName.split('/').at(-1)
    if (name == null) throw Error('Illegal file name')
    this.#name = name

    this.#initReady = this.#init(fileName, opts)
  }

  async #init(fileName: string, opts: FileOpts) {
    const dir = await makeParent(fileName)
    this.#parent = dir
    this.#fh = await dir.getFileHandle(this.#name, opts)
    if (opts.overwrite === true) {
      const w = await this.#fh.createWritable()
      await w.truncate(0)
      await w.close()
    }
    this.#fileSize = (await this.#fh.getFile()).size

    this.#accessHandle = await createOPFSAccess()(fileName, this.#fh)
  }

  get size() {
    return this.#fileSize
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
            await this.#initReady
            return await readNext(this.#accessHandle!)
          }
        }
      }
    }
  }

  async append(str: string) {
    await this.#initReady
    this.#fileSize += await this.#accessHandle?.write(
      this.#txtEC.encode(str).buffer,
      { at: this.#fileSize }
    ) ?? 0
  }

  async text() {
    const txtDC = new TextDecoder()
    return txtDC.decode(await (await this.#fh?.getFile())?.arrayBuffer())
  }

  async remove() {
    await this.#accessHandle?.close()
    await this.#parent?.removeEntry(this.#name)
  }
}
