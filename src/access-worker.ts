import { FileSystemSyncAccessHandle } from './common';
import OPFSWorker from './opfs-worker?worker&inline';

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
  filePath: string
): Promise<OPFSWorkerAccessHandle> {
  const postMsg = getWorkerMsger();
  await postMsg('register', { filePath });
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
    const worker = new OPFSWorker();

    let cbId = 0;
    let cbFns: Record<number, { resolve: Function; reject: Function }> = {};

    worker.onmessage = ({
      data,
    }: {
      data: {
        cbId: number;
        returnVal?: unknown;
        evtType: string;
        errMsg: string;
      };
    }) => {
      if (data.evtType === 'callback') {
        cbFns[data.cbId]?.resolve(data.returnVal);
      } else if (data.evtType === 'throwError') {
        cbFns[data.cbId]?.reject(Error(data.errMsg));
      }
      delete cbFns[data.cbId];
    };

    return async function postMsg(
      evtType: string,
      args: unknown,
      trans: Transferable[] = []
    ) {
      cbId += 1;

      const rsP = new Promise((resolve, reject) => {
        cbFns[cbId] = { resolve, reject };
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
