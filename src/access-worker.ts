interface FileSystemSyncAccessHandle {
  read: (container: ArrayBuffer, opts: { at: number }) => number;
  write: (data: ArrayBuffer | ArrayBufferView, opts?: { at: number }) => number;
  flush: () => void;
  close: () => void;
  truncate: (newSize: number) => void;
  getSize: () => number;
}

type Async<F> = F extends (...args: infer Params) => infer R
  ? (...args: Params) => Promise<R>
  : never;

export type OPFSWorkerAccessHandle = {
  read: (offset: number, size: number) => Promise<ArrayBuffer>;
  write: Async<FileSystemSyncAccessHandle['write']>;
  close: Async<FileSystemSyncAccessHandle['close']>;
  truncate: Async<FileSystemSyncAccessHandle['truncate']>;
  getSize: Async<FileSystemSyncAccessHandle['getSize']>;
  flush: Async<FileSystemSyncAccessHandle['flush']>;
};

export async function createOPFSAccess(
  filePath: string,
  fileHandle: FileSystemFileHandle
): Promise<OPFSWorkerAccessHandle> {
  const postMsg = getWorkerMsger();
  await postMsg('register', { filePath, fileHandle });
  return {
    read: async (offset, size) =>
      (await postMsg('read', {
        filePath,
        offset,
        size,
      })) as ArrayBuffer,
    write: async (data, opts) =>
      (await postMsg(
        'write',
        {
          filePath,
          data,
          opts,
        },
        [ArrayBuffer.isView(data) ? data.buffer : data]
      )) as number,
    close: async () =>
      (await postMsg('close', {
        filePath,
      })) as void,
    truncate: async (newSize: number) =>
      (await postMsg('truncate', {
        filePath,
        newSize,
      })) as void,
    getSize: async () =>
      (await postMsg('getSize', {
        filePath,
      })) as number,
    flush: async () =>
      (await postMsg('flush', {
        filePath,
      })) as void,
  };
}

const msgerCache: Array<Function> = [];
let nextMsgerIdx = 0;
function getWorkerMsger() {
  // Create a maximum of three workers
  if (msgerCache.length < 3) {
    const msger = create();
    msgerCache.push(msger);
    return msger;
  } else {
    const msger = msgerCache[nextMsgerIdx];
    nextMsgerIdx = (nextMsgerIdx + 1) % msgerCache.length;
    return msger;
  }

  function create() {
    const blob = new Blob([`(${opfsWorkerSetup.toString()})()`]);
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);

    let cbId = 0;
    let cbFns: Record<number, Function> = {};

    worker.onmessage = ({
      data,
    }: {
      data: { cbId: number; returnVal: unknown; evtType: string };
    }) => {
      if (data.evtType === 'callback') {
        cbFns[data.cbId]?.(data.returnVal);
        delete cbFns[data.cbId];
      }
    };

    return async function postMsg(
      evtType: string,
      args: unknown,
      trans: Transferable[] = []
    ) {
      cbId += 1;

      const rsP = new Promise((resolve) => {
        cbFns[cbId] = resolve;
      });
      worker.postMessage(
        {
          cbId,
          evtType,
          args,
        },
        trans
      );

      return rsP;
    };
  }
}

const opfsWorkerSetup = (): void => {
  const fileAccesserMap: Record<string, FileSystemSyncAccessHandle> = {};

  self.onmessage = async (e) => {
    const { evtType, args } = e.data;

    let accessHandle = fileAccesserMap[args.filePath];

    let returnVal;
    const trans: Transferable[] = [];
    if (evtType === 'register') {
      accessHandle = await args.fileHandle.createSyncAccessHandle();
      fileAccesserMap[args.filePath] = accessHandle;
    } else if (evtType === 'close') {
      accessHandle.close();
      delete fileAccesserMap[args.filePath];
    } else if (evtType === 'truncate') {
      accessHandle.truncate(args.newSize);
    } else if (evtType === 'write') {
      const { data, opts } = e.data.args;
      returnVal = accessHandle.write(data, opts);
    } else if (evtType === 'read') {
      const { offset, size } = e.data.args;
      const buf = new ArrayBuffer(size);
      const readLen = accessHandle.read(buf, { at: offset });
      returnVal =
        readLen === size
          ? buf
          : // @ts-expect-error transfer support by chrome 114
            buf.transfer?.(readLen) ?? buf.slice(0, readLen);
      trans.push(returnVal);
    } else if (evtType === 'getSize') {
      returnVal = accessHandle.getSize();
    } else if (evtType === 'flush') {
      accessHandle.flush();
    }

    self.postMessage(
      {
        evtType: 'callback',
        cbId: e.data.cbId,
        returnVal,
      },
      // @ts-expect-error
      trans
    );
  };
};
