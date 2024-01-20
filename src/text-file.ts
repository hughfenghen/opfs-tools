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
  #accessHandle: { write: (data: unknown) => Promise<unknown> } | null = null

  #txtEC = new TextEncoder()

  constructor(fileName: string) {
    const name = fileName.split('/').at(-1)
    if (name == null) throw Error('Illegal file name')
    this.#name = name

    this.#initReady = this.#init(fileName)
  }

  async #init(fileName: string) {
    const dir = await makeParent(fileName)
    this.#fh = await dir.getFileHandle(this.#name, { create: true })

    this.#accessHandle = await createOPFSAccess()(fileName, this.#fh)
  }

  read(offset: number, size: number) { }

  async append(str: string) {
    console.log(4444, str)
    await this.#initReady
    await this.#accessHandle?.write(this.#txtEC.encode(str))
  }

  insert(offset: number, str: string) { }
}

interface FileSystemSyncAccessHandle {
  read: (container: ArrayBuffer, opts: { at: number }) => void
  write: (data: ArrayBuffer) => number
  flush: () => void
  getSize: () => number
}

function createOPFSAccess() {
  const blob = new Blob([`(${opfsWorkerSetup.toString()})()`])
  const url = URL.createObjectURL(blob)
  const worker = new Worker(url)

  let cbId = 0
  let cbFns: Record<number, Function> = {}
  async function postMsg(evtType: string, args: unknown) {
    cbId += 1

    const rsP = new Promise(resolve => {
      cbFns[cbId] = resolve
    })
    worker.postMessage({
      cbId,
      evtType,
      args
    })

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

  return async (fileName: string, fileHandle: FileSystemFileHandle) => {
    await postMsg('register', { fileName, fileHandle })
    return {
      write: async (data: unknown) => await postMsg('write', { fileName, data })
    }
  }
}

const opfsWorkerSetup = (): void => {
  const fileAccesserMap: Record<string, FileSystemSyncAccessHandle> = {}

  self.onmessage = async e => {
    const {
      evtType,
      args: { fileName, fileHandle }
    } = e.data

    let accessHandle = fileAccesserMap[fileName]

    let returnVal
    const trans: Transferable[] = []
    if (evtType === 'register') {
      accessHandle = await fileHandle.createSyncAccessHandle()
      fileAccesserMap[fileName] = accessHandle
    } else if (evtType === 'write') {
      accessHandle.write(e.data.args.data)
      accessHandle.flush()
    } else if (evtType === 'read') {
      const { offset, size } = e.data.args
      const buf = new ArrayBuffer(size)
      accessHandle.read(buf, { at: offset })
      returnVal = buf
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
