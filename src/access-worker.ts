
interface FileSystemSyncAccessHandle {
  read: (container: ArrayBuffer, opts: { at: number }) => number
  write: (data: ArrayBuffer | ArrayBufferView, opts?: { at: number }) => number
  flush: () => void
  close: () => void
  truncate: (newSize: number) => void
  getSize: () => number
}

type Async<F> = F extends (...args: infer Params) => infer R
  ? (...args: Params) => Promise<R>
  : never

export type OPFSWorkerAccessHandle = {
  read: (offset: number, size: number) => Promise<ArrayBuffer>
  write: (data: ArrayBuffer | ArrayBufferView, opts?: { at: number, flush?: boolean }) => Promise<number>
  close: Async<FileSystemSyncAccessHandle['close']>
  truncate: Async<FileSystemSyncAccessHandle['truncate']>
  getSize: Async<FileSystemSyncAccessHandle['getSize']>
  flush: Async<FileSystemSyncAccessHandle['flush']>
}

// todo: 池化 worker 避免创建数量过多
export function createOPFSAccess() {
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
        }, [])) as number,
      close: async () => (await postMsg('close', {
        fileName,
      })) as void,
      truncate: async (newSize: number) => (await postMsg('truncate', {
        fileName,
        newSize
      })) as void,
      getSize: async () => (await postMsg('getSize', {
        fileName,
      })) as number,
      flush: async () => (await postMsg('flush', {
        fileName,
      })) as void
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
    } else if (evtType === 'close') {
      accessHandle.close()
      delete fileAccesserMap[args.fileName]
    } else if (evtType === 'truncate') {
      accessHandle.truncate(args.newSize)
    } else if (evtType === 'write') {
      const { data, opts } = e.data.args
      returnVal = accessHandle.write(data, opts)
      if (opts.flush === true) accessHandle.flush()
    } else if (evtType === 'read') {
      const { offset, size } = e.data.args
      const buf = new ArrayBuffer(size)
      const readLen = accessHandle.read(buf, { at: offset })
      // @ts-expect-error transfer support by chrome 114
      returnVal = buf.transfer?.(readLen) ?? buf.slice(0, readLen)
      trans.push(returnVal)
    } else if (evtType === 'getSize') {
      returnVal = accessHandle.getSize()
    } else if (evtType === 'flush') {
      accessHandle.flush()
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
