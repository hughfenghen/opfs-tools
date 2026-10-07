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

type Msger = {
  postMsg: PostMsg;
  terminate: () => void;
};

// ============================================================================
// Worker 池 + path 粘性路由器
// ----------------------------------------------------------------------------
// 用一张 `path → worker` 绑定表取代原单例：同一 filePath 的全部消息在其存活期内
// 恒定命中同一 Worker 实例（Worker 内按 path 持唯一句柄 + 引用计数的前提）。
// 扩容只影响新 path 的分配、缩容只销毁无绑定的空闲 Worker，二者都不触碰活跃 path。
// ============================================================================

const MAX_WORKERS = 10;
const MIN_WORKERS = 3;
// 空闲 Worker 的冷却时长（ms）：pathCount 归零后不立刻销毁，延时到期仍空闲才 terminate。
// 吸收常见 close→reopen 抖动，避免反复重建 Worker 的成本；可按实测调整。
const WORKER_IDLE_TTL_MS = 10_000;

type WorkerEntry = {
  msger: Msger;
  // 当前绑定到该 Worker 的活跃 path 数；为 0 表示空闲。
  pathCount: number;
  // 空闲冷却计时器句柄；非空表示该 Worker 正在冷却待销毁。
  shrinkTimer?: ReturnType<typeof setTimeout>;
};

type PathBinding = {
  workerId: number;
  // 该 path 的 open 净计数，与 Worker 内 handles 的 count 对应。
  openCount: number;
};

const workers = new Map<number, WorkerEntry>();
const pathBindings = new Map<string, PathBinding>();
let workerSeq = 0;

/** 新建一个 Worker 并入表，注入「死亡时清理本 Worker 绑定」的钩子。 */
function spawnWorker(): number {
  const workerId = (workerSeq += 1);
  const msger = createMsger(() => handleWorkerFatal(workerId));
  workers.set(workerId, { msger, pathCount: 0 });
  return workerId;
}

/** 预热：把池补齐到下限 MIN_WORKERS（用户决策：下限恒为 3 的常驻预热池）。 */
function ensurePrewarm(): void {
  while (workers.size < MIN_WORKERS) spawnWorker();
}

/**
 * 为「新 path」选择一个 Worker（4.3）：
 * 1. 空闲 Worker（pathCount===0）优先复用；
 * 2. 否则未达上限则扩容新建；
 * 3. 否则选 pathCount 最小者复用（多路复用 → 在该 Worker 线程内串行排队）。
 */
function pickWorkerForNewPath(): number {
  let minId = -1;
  let minCount = Infinity;
  for (const [id, entry] of workers) {
    if (entry.pathCount === 0) return id;
    if (entry.pathCount < minCount) {
      minCount = entry.pathCount;
      minId = id;
    }
  }
  if (workers.size < MAX_WORKERS) return spawnWorker();
  return minId;
}

/**
 * 为新 path 同步建立绑定（必须在任何 await 之前完成，避免并发 open 把同一新 path
 * 绑到不同 Worker）。返回所绑定 Worker 的 id。
 */
function bindNewPath(filePath: string): number {
  // 下限恒为 3：首次访问即预热到 MIN_WORKERS。
  ensurePrewarm();
  const workerId = pickWorkerForNewPath();
  const entry = workers.get(workerId);
  if (entry != null) entry.pathCount += 1;
  // 该 Worker 可能正处于空闲冷却中（被优先复用），取消其销毁计时。
  cancelShrink(workerId);
  pathBindings.set(filePath, { workerId, openCount: 1 });
  return workerId;
}

/** 按 path 路由到其绑定 Worker 的 postMsg；未绑定返回 null。 */
function routeTo(filePath: string): PostMsg | null {
  const binding = pathBindings.get(filePath);
  if (binding == null) return null;
  return workers.get(binding.workerId)?.msger.postMsg ?? null;
}

/**
 * 为空闲（pathCount===0）Worker 安排延时冷却销毁：到期仍空闲且高于下限才真正 terminate。
 * 已在冷却中则不重复安排（空闲状态连续，无需重置计时）。
 */
function scheduleShrink(workerId: number): void {
  const entry = workers.get(workerId);
  if (entry == null || entry.pathCount > 0 || entry.shrinkTimer != null) return;
  entry.shrinkTimer = setTimeout(() => runShrink(workerId), WORKER_IDLE_TTL_MS);
}

/** 冷却到期回调：重新判定（池大小可能已变），仍空闲且高于下限才销毁，否则保活为预热池。 */
function runShrink(workerId: number): void {
  const entry = workers.get(workerId);
  if (entry == null) return;
  entry.shrinkTimer = undefined;
  if (entry.pathCount > 0) return;
  if (workers.size > MIN_WORKERS) {
    entry.msger.terminate();
    workers.delete(workerId);
  }
}

/** Worker 被复用（pathCount 从 0 升起）时取消其冷却计时，避免被销毁。 */
function cancelShrink(workerId: number): void {
  const entry = workers.get(workerId);
  if (entry?.shrinkTimer != null) {
    clearTimeout(entry.shrinkTimer);
    entry.shrinkTimer = undefined;
  }
}

/** close / open 失败回滚：openCount--，归零则解绑 + pathCount-- + 缩减判定。 */
function releasePath(filePath: string): void {
  const binding = pathBindings.get(filePath);
  if (binding == null) return;
  binding.openCount -= 1;
  if (binding.openCount <= 0) {
    pathBindings.delete(filePath);
    const entry = workers.get(binding.workerId);
    if (entry != null) {
      entry.pathCount -= 1;
      if (entry.pathCount <= 0) scheduleShrink(binding.workerId);
    }
  }
}

/** forceClose：无视计数直接解绑 + pathCount-- + 冷却判定。 */
function forceUnbind(filePath: string): void {
  const binding = pathBindings.get(filePath);
  if (binding == null) return;
  pathBindings.delete(filePath);
  const entry = workers.get(binding.workerId);
  if (entry != null) {
    entry.pathCount -= 1;
    if (entry.pathCount <= 0) scheduleShrink(binding.workerId);
  }
}

/**
 * 某 Worker onerror 时的清理：移除该 Worker 并解绑其名下所有 path，
 * 使后续 open 可重新分配（不就地重建以免错误循环；下次 open 的 ensurePrewarm 会补回下限）。
 */
function handleWorkerFatal(workerId: number): void {
  const entry = workers.get(workerId);
  // 清理挂起的冷却计时器，避免到期后对已移除的 workerId 空跑。
  if (entry?.shrinkTimer != null) clearTimeout(entry.shrinkTimer);
  workers.delete(workerId);
  for (const [filePath, binding] of pathBindings) {
    if (binding.workerId === workerId) pathBindings.delete(filePath);
  }
}

/**
 * 打开（或复用）某文件在其绑定 Worker 中的唯一句柄，返回读写代理。
 * 同一 tab 内，同一 path 的所有 reader/writer 恒定命中同一 Worker 里的唯一句柄，
 * 读写经该单 Worker 线程天然串行排队。
 */
export async function createOPFSAccess(
  filePath: string
): Promise<OPFSWorkerAccessHandle> {
  // 在任何 await 之前同步完成绑定/增计数，保证并发 open 的粘性路由正确。
  const binding = pathBindings.get(filePath);
  if (binding == null) {
    bindNewPath(filePath);
  } else {
    binding.openCount += 1;
  }

  const postMsg = routeTo(filePath);
  if (postMsg == null) throw Error(`route not found: ${filePath}`);

  try {
    await postMsg('open', { filePath });
  } catch (err) {
    // open 转发失败：回滚路由侧计数/绑定，避免条目残留。
    releasePath(filePath);
    throw err;
  }

  return {
    read: async (offset, size) => {
      const pm = routeTo(filePath);
      if (pm == null) throw Error(`file not opened: ${filePath}`);
      return (await pm('read', { filePath, offset, size })) as ArrayBuffer;
    },
    write: async (data, opts) => {
      const pm = routeTo(filePath);
      if (pm == null) throw Error(`file not opened: ${filePath}`);
      return (await pm('write', { filePath, data, opts }, [
        ArrayBuffer.isView(data) ? data.buffer : data,
      ])) as number;
    },
    close: async () => {
      const pm = routeTo(filePath);
      try {
        if (pm != null) await pm('close', { filePath });
      } finally {
        releasePath(filePath);
      }
    },
    truncate: async (newSize: number) => {
      const pm = routeTo(filePath);
      if (pm == null) throw Error(`file not opened: ${filePath}`);
      await pm('truncate', { filePath, newSize });
    },
    getSize: async () => {
      const pm = routeTo(filePath);
      if (pm == null) throw Error(`file not opened: ${filePath}`);
      return (await pm('getSize', { filePath })) as number;
    },
    flush: async () => {
      const pm = routeTo(filePath);
      if (pm == null) throw Error(`file not opened: ${filePath}`);
      await pm('flush', { filePath });
    },
  };
}

/** 发送控制类消息（isOpen / forceClose），供 file.ts 的 remove 使用。 */
export function postToOPFS(
  filePath: string,
  evtType: 'isOpen' | 'forceClose'
): Promise<unknown> {
  const postMsg = routeTo(filePath);
  if (evtType === 'isOpen') {
    // 未绑定说明无 Worker 可问，直接判定未打开。
    if (postMsg == null) return Promise.resolve(false);
    return postMsg('isOpen', { filePath });
  }
  // forceClose：未绑定则无事可做。
  if (postMsg == null) return Promise.resolve(undefined);
  const resP = postMsg('forceClose', { filePath });
  forceUnbind(filePath);
  return resP;
}

/**
 * 创建单个 Worker 的消息收发器（每 Worker 一个）。
 * onFatal 在 Worker 加载/运行错误时被调用，交由路由器清理本 Worker 的绑定。
 */
function createMsger(onFatal: () => void): Msger {
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
    // 通知路由器移除该 Worker 并解绑其名下所有 path。
    onFatal();
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

  const postMsg: PostMsg = (evtType, args, trans = []) => {
    cbId += 1;
    const id = cbId;
    const rsP = new Promise((resolve, reject) => {
      cbFns[id] = { resolve, reject };
    });
    worker.postMessage({ cbId: id, evtType, args }, trans);
    return rsP;
  };

  return { postMsg, terminate: () => worker.terminate() };
}

// ============================================================================
// 仅供单元测试：暴露 Worker 池内部以验证空闲冷却状态机。
// 不经 index.ts 再导出，不属于对外 API（gen-api.js 仅解析 file/directory/tmpfile）。
// ============================================================================
export const __test__ = {
  workers,
  pathBindings,
  WORKER_IDLE_TTL_MS,
  MIN_WORKERS,
  scheduleShrink,
  runShrink,
  cancelShrink,
  handleWorkerFatal,
};
