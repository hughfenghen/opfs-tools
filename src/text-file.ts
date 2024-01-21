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

export class TextFile {
  #name: string
  #fh: FileSystemFileHandle | null = null
  #initReady: Promise<void>
  #accessHandle: OPFSWorkerAccessHandle | null = null

  #txtEC = new TextEncoder()

  #fileSize = 0

  constructor(fileName: string) {
    const name = fileName.split('/').at(-1)
    if (name == null) throw Error('Illegal file name')
    this.#name = name

    this.#initReady = this.#init(fileName)
  }

  async #init(fileName: string) {
    const dir = await makeParent(fileName)
    this.#fh = await dir.getFileHandle(this.#name, { create: false })
    this.#fileSize = (await this.#fh.getFile()).size

    this.#accessHandle = await createOPFSAccess()(fileName, this.#fh)
  }

  read(offset: number, length: number) { }

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

  insert(offset: number, str: string) { }
}

interface FileSystemSyncAccessHandle {
  read: (container: ArrayBuffer, opts: { at: number }) => number
  write: (data: ArrayBuffer, opts: { at: number }) => number
  flush: () => void
  // getSize: () => number
}

type Async<F> = F extends (...args: infer Params) => infer R
  ? (...args: Params) => Promise<R>
  : never

type OPFSWorkerAccessHandle = {
  read: (offset: number, size: number) => Promise<ArrayBuffer>
  write: Async<FileSystemSyncAccessHandle['write']>
}

function createOPFSAccess() {
  const blob = new Blob([`(${opfsWorkerSetup.toString()})()`])
  const url = URL.createObjectURL(blob)
  const worker = new Worker(url)

  let cbId = 0
  let cbFns: Record<number, Function> = {}
  async function postMsg(evtType: string, args: unknown, trans: Transferable[] = []) {
    cbId += 1

    const rsP = new Promise(resolve => {
      cbFns[cbId] = resolve
    })
    worker.postMessage({
      cbId,
      evtType,
      args
    }, trans)

    return rsP
  }

  worker.onmessage = ({
    data
  }: {
    data: { cbId: number; returnVal: unknown; evtType: string }
  }) => {
    if (data.evtType === 'callback') {
      cbFns[data.cbId]?.(data.returnVal)
      delete cbFns[data.cbId]
    }
  }

  return async (
    fileName: string,
    fileHandle: FileSystemFileHandle
  ): Promise<OPFSWorkerAccessHandle> => {
    await postMsg('register', { fileName, fileHandle })
    return {
      read: async (offset, size) => (await postMsg('read', {
        fileName,
        offset,
        size
      })) as ArrayBuffer,
      write: async (data, opts) =>
        (await postMsg('write', {
          fileName,
          data,
          opts
        }, [data])) as number,
    }
  }
}

const opfsWorkerSetup = (): void => {
  const fileAccesserMap: Record<string, FileSystemSyncAccessHandle> = {}

  self.onmessage = async e => {
    const { evtType, args } = e.data

    let accessHandle = fileAccesserMap[args.fileName]

    let returnVal
    const trans: Transferable[] = []
    if (evtType === 'register') {
      accessHandle = await args.fileHandle.createSyncAccessHandle()
      fileAccesserMap[args.fileName] = accessHandle
    } else if (evtType === 'write') {
      const { data, opts } = e.data.args
      returnVal = accessHandle.write(data, opts)
      accessHandle.flush()
    } else if (evtType === 'read') {
      const { offset, size } = e.data.args
      const buf = new ArrayBuffer(size)
      const readLen = accessHandle.read(buf, { at: offset })
      // @ts-expect-error transfer support by chrome 114
      returnVal = buf.transfer?.(readLen) ?? buf.slice(0, readLen)
      trans.push(returnVal)
    }

    self.postMessage(
      {
        evtType: 'callback',
        cbId: e.data.cbId,
        returnVal
      },
      // @ts-expect-error
      trans
    )
  }
}
