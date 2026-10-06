import { FileSystemSyncAccessHandle } from './common';
// createSyncAccessHandle 仅在 Dedicated Worker 可用（SharedWorker 不暴露），故使用内联专用 Worker。
// 内联（blob）对专用 Worker 无影响：每个 tab 本就各自持有自己的 Worker，不需要跨 tab 共享实例。
import OPFSWorker from './opfs-worker?worker&inline';

export type OPFSWorkerAccessHandle = {
  read: (offset: number, size: number) => Promise<ArrayBuffer>;
  write: FileSystemSyncAccessHandle['write'];
  close: FileSystemSyncAccessHandle['close'];
  truncate: FileSystemSyncAccessHandle['truncate'];
  getSize: FileSystemSyncAccessHandle['getSize'];
  flush: FileSystemSyncAccessHandle['flush'];
};

type PostMsg = (
  evtType: string,
  args: Record<string, unknown>,
  trans?: Transferable[]
) => Promise<unknown>;

/**
 * 打开（或复用）某文件在 Worker 中的唯一句柄，返回读写代理。
 * 同一 tab 内，同一 path 的所有 reader/writer 共享该 Worker 里的唯一句柄，
 * 读写经单 Worker 线程天然串行排队。
 */
export async function createOPFSAccess(
  filePath: string
): Promise<OPFSWorkerAccessHandle> {
  const postMsg = getWorker();
  await postMsg('open', { filePath });
  return {
    read: async (offset, size) =>
      (await postMsg('read', { filePath, offset, size })) as ArrayBuffer,
    write: async (data, opts) =>
      (await postMsg('write', { filePath, data, opts }, [
        ArrayBuffer.isView(data) ? data.buffer : data,
      ])) as number,
    close: async () => (await postMsg('close', { filePath })) as void,
    truncate: async (newSize: number) =>
      (await postMsg('truncate', { filePath, newSize })) as void,
    getSize: async () => (await postMsg('getSize', { filePath })) as number,
    flush: async () => (await postMsg('flush', { filePath })) as void,
  };
}

/** 发送控制类消息（isOpen / forceClose），供 file.ts 的 remove 使用。 */
export function postToOPFS(
  filePath: string,
  evtType: 'isOpen' | 'forceClose'
): Promise<unknown> {
  return getWorker()(evtType, { filePath });
}

// 单个内联 Dedicated Worker：按 path 持句柄 + 计数需要「同一 path 始终同一 Worker」，
// 单实例天然满足；读写在单线程串行。
let msger: PostMsg | null = null;
function getWorker(): PostMsg {
  if (msger == null) msger = createMsger();
  return msger;
}

function createMsger(): PostMsg {
  const worker = new OPFSWorker();

  let cbId = 0;
  const cbFns: Record<number, { resolve: Function; reject: Function }> = {};

  // Worker 加载/运行错误透传到页面控制台，并拒绝挂起的调用，避免 open promise 永久挂起。
  worker.onerror = (ev: any) => {
    const errMsg = ev?.message ?? ev?.error?.message ?? 'worker error';
    console.error(`[opfs-tools] worker error: ${errMsg}`);
    for (const id of Object.keys(cbFns)) {
      cbFns[+id]?.reject(Error(`worker error: ${errMsg}`));
      delete cbFns[+id];
    }
  };

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

  return (evtType, args, trans = []) => {
    cbId += 1;
    const id = cbId;
    const rsP = new Promise((resolve, reject) => {
      cbFns[id] = { resolve, reject };
    });
    worker.postMessage({ cbId: id, evtType, args }, trans);
    return rsP;
  };
}
