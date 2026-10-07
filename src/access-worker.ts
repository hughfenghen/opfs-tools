import { FileSystemSyncAccessHandle } from './common';
// createSyncAccessHandle 仅在 Dedicated Worker 可用（SharedWorker 不暴露），故使用内联专用 Worker。
// 内联（blob）对专用 Worker 无影响：每个 tab 本就各自持有自己的 Worker，不需要跨 tab 共享实例。
import OPFSWorker from './opfs-worker?worker&inline';

// 这些句柄方法经 Worker 消息往返，实现均为异步，故在同步版 FileSystemSyncAccessHandle
// 参数类型基础上统一包成 Promise 返回，按实际实现声明。
export type OPFSWorkerAccessHandle = {
  read: (offset: number, size: number) => Promise<ArrayBuffer>;
  write: (
    data: Parameters<FileSystemSyncAccessHandle['write']>[0],
    opts?: Parameters<FileSystemSyncAccessHandle['write']>[1]
  ) => Promise<number>;
  close: () => Promise<void>;
  truncate: (newSize: number) => Promise<void>;
  getSize: () => Promise<number>;
  flush: () => Promise<void>;
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
  // 当前绑定到该 Worker 的 path 数，仅供 pickWorkerForNewPath 负载均衡；
  // bind 时 ++，terminate 清绑定时归零（不再随 close 递减，由 idle 信号判空闲）。
  pathCount: number;
  // 空闲标志：由 opfs-worker 的句柄全闭信号驱动，取代原先用 pathCount 判空闲。
  idle: boolean;
  // 空闲冷却计时器句柄；非空表示该 Worker 正在冷却待销毁。
  shrinkTimer?: ReturnType<typeof setTimeout>;
};

const workers = new Map<number, WorkerEntry>();
const pathBindings = new Map<string, number>();
let workerSeq = 0;

/** 新建一个 Worker 并入表，注入「死亡时清理」与「空闲信号」两个钩子。 */
function spawnWorker(): number {
  const workerId = (workerSeq += 1);
  const msger = createMsger(
    () => handleWorkerFatal(workerId),
    () => onIdle(workerId)
  );
  // 新 Worker 尚无句柄，初始 idle；若随即被 bindNewPath 复用会被 markBusy 置回。
  workers.set(workerId, { msger, pathCount: 0, idle: true });
  return workerId;
}

/** 预热：把池补齐到下限 MIN_WORKERS（用户决策：下限恒为 3 的常驻预热池）。 */
function ensurePrewarm(): void {
  while (workers.size < MIN_WORKERS) spawnWorker();
}

/**
 * 为「新 path」选择一个 Worker（4.3）：
 * 1. 空闲 Worker（entry.idle，由句柄全闭信号驱动）优先复用；
 * 2. 否则未达上限则扩容新建；
 * 3. 否则选 pathCount 最小者复用（多路复用 → 在该 Worker 线程内串行排队）。
 */
function pickWorkerForNewPath(): number {
  let minId = -1;
  let minCount = Infinity;
  for (const [id, entry] of workers) {
    if (entry.idle) return id;
    if (entry.pathCount < minCount) {
      minCount = entry.pathCount;
      minId = id;
    }
  }
  if (workers.size < MAX_WORKERS) return spawnWorker();
  return minId;
}

/** 标记某 Worker 为繁忙：置 idle=false 并取消其冷却计时（任何 open 转发前同步调用）。 */
function markBusy(workerId: number): void {
  const entry = workers.get(workerId);
  if (entry == null) return;
  entry.idle = false;
  cancelShrink(workerId);
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
  pathBindings.set(filePath, workerId);
  // 置繁忙 + 取消冷却（该 Worker 可能正处于空闲冷却中被优先复用）。
  markBusy(workerId);
  return workerId;
}

/** 按 path 路由到其绑定 Worker 的 postMsg；未绑定返回 null。 */
function routeTo(filePath: string): PostMsg | null {
  const workerId = pathBindings.get(filePath);
  if (workerId == null) return null;
  return workers.get(workerId)?.msger.postMsg ?? null;
}

/**
 * 为空闲（entry.idle）Worker 安排延时冷却销毁：到期仍空闲且高于下限才真正 terminate。
 * 已在冷却中则不重复安排（空闲状态连续，无需重置计时）。
 */
function scheduleShrink(workerId: number): void {
  const entry = workers.get(workerId);
  if (entry == null || !entry.idle || entry.shrinkTimer != null) return;
  entry.shrinkTimer = setTimeout(() => runShrink(workerId), WORKER_IDLE_TTL_MS);
}

/**
 * 冷却到期回调：重新判定（期间可能又被 open 置忙），仍空闲且高于下限才销毁，
 * 并连带清除该 Worker 名下所有 path 绑定（此刻 idle ⇒ 无存活句柄，清绑定安全）。
 */
function runShrink(workerId: number): void {
  const entry = workers.get(workerId);
  if (entry == null) return;
  entry.shrinkTimer = undefined;
  if (!entry.idle) return;
  if (workers.size > MIN_WORKERS) {
    entry.msger.terminate();
    workers.delete(workerId);
    for (const [filePath, wid] of pathBindings) {
      if (wid === workerId) pathBindings.delete(filePath);
    }
  }
}

/** Worker 被复用（重新置忙）时取消其冷却计时，避免被销毁。 */
function cancelShrink(workerId: number): void {
  const entry = workers.get(workerId);
  if (entry?.shrinkTimer != null) {
    clearTimeout(entry.shrinkTimer);
    entry.shrinkTimer = undefined;
  }
}

/** 收到 opfs-worker 的空闲信号（句柄全闭）：置 idle 并启动冷却回收倒计时。 */
function onIdle(workerId: number): void {
  const entry = workers.get(workerId);
  if (entry == null) return;
  entry.idle = true;
  scheduleShrink(workerId);
}

/**
 * open 转发失败且本次新建了绑定时的回滚：删除绑定、pathCount--，
 * 若该 Worker 已无绑定则置 idle 并安排冷却（open 失败时 Worker 未发 idle 信号，须主动兜底）。
 */
function unbindFailedOpen(filePath: string, workerId: number): void {
  pathBindings.delete(filePath);
  const entry = workers.get(workerId);
  if (entry == null) return;
  entry.pathCount -= 1;
  if (entry.pathCount <= 0) {
    entry.idle = true;
    scheduleShrink(workerId);
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
  for (const [filePath, wid] of pathBindings) {
    if (wid === workerId) pathBindings.delete(filePath);
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
  // 在任何 await 之前同步完成绑定/置忙，保证并发 open 的粘性路由正确、
  // 且空闲信号晚于新 open 时被 idle=false 兜住（见 4.3 竞态处理）。
  const bound = pathBindings.get(filePath);
  const isNewBinding = bound == null;
  const workerId = isNewBinding
    ? bindNewPath(filePath)
    : (markBusy(bound), bound);

  const postMsg = routeTo(filePath);
  if (postMsg == null) throw Error(`route not found: ${filePath}`);

  try {
    await postMsg('open', { filePath });
  } catch (err) {
    // open 转发失败：仅当本次新建了绑定时回滚，避免误删复用中的既有绑定。
    if (isNewBinding) unbindFailedOpen(filePath, workerId);
    throw err;
  }

  return {
    read: async (offset, size) => {
      return (await postMsg('read', { filePath, offset, size })) as ArrayBuffer;
    },
    write: async (data, opts) => {
      return (await postMsg('write', { filePath, data, opts }, [
        ArrayBuffer.isView(data) ? data.buffer : data,
      ])) as number;
    },
    close: async () => {
      await postMsg('close', { filePath });
    },
    truncate: async (newSize: number) => {
      await postMsg('truncate', { filePath, newSize });
    },
    getSize: async () => {
      return (await postMsg('getSize', { filePath })) as number;
    },
    flush: async () => {
      await postMsg('flush', { filePath });
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
  // forceClose：未绑定则无事可做。绑定清理交由后续 idle 信号 → 冷却 → terminate。
  if (postMsg == null) return Promise.resolve(undefined);
  return postMsg('forceClose', { filePath });
}

/**
 * 创建单个 Worker 的消息收发器（每 Worker 一个）。
 * onFatal 在 Worker 加载/运行错误时被调用，交由路由器清理本 Worker 的绑定。
 */
function createMsger(onFatal: () => void, onIdle: () => void): Msger {
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
    // 空闲信号：非回调消息（无 cbId），句柄全闭时由 opfs-worker 主动发来。
    if (data.evtType === 'idle') {
      onIdle();
      return;
    }
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
  onIdle,
};
