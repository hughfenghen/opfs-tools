import { expect, test, vi, beforeEach, afterEach } from 'vitest';
import { __test__ } from '../access-worker';

const {
  workers,
  pathBindings,
  WORKER_IDLE_TTL_MS,
  MIN_WORKERS,
  scheduleShrink,
  runShrink,
  cancelShrink,
  handleWorkerFatal,
} = __test__;

// 伪造一个 WorkerEntry：terminate 为间谍，postMsg 为空实现，避免创建真实 OPFSWorker。
function fakeEntry(pathCount = 0) {
  return {
    msger: {
      postMsg: (async () => undefined) as any,
      terminate: vi.fn(),
    },
    pathCount,
  };
}

// 向池中注入 n 个空闲（pathCount===0）伪造 Worker，id 从 1 起。
function seedIdle(n: number) {
  for (let i = 1; i <= n; i++) workers.set(i, fakeEntry(0));
}

beforeEach(() => {
  vi.useFakeTimers();
  workers.clear();
  pathBindings.clear();
});

afterEach(() => {
  vi.useRealTimers();
  workers.clear();
  pathBindings.clear();
});

test('idle and above floor: terminates and removes only after cooldown elapses', () => {
  seedIdle(4); // size 4 > MIN_WORKERS(3)
  const entry = workers.get(1)!;

  scheduleShrink(1);
  // 未到期：不立刻销毁，计时器已挂起
  expect(entry.shrinkTimer).not.toBeUndefined();
  expect(entry.msger.terminate).not.toHaveBeenCalled();
  expect(workers.has(1)).toBe(true);

  vi.advanceTimersByTime(WORKER_IDLE_TTL_MS);
  // 到期：重判定仍空闲且 size>MIN → terminate + delete
  expect(entry.msger.terminate).toHaveBeenCalledTimes(1);
  expect(workers.has(1)).toBe(false);
});

test('at MIN_WORKERS floor when timer fires: kept alive, not destroyed', () => {
  seedIdle(MIN_WORKERS); // size == MIN_WORKERS
  const entry = workers.get(1)!;

  scheduleShrink(1);
  vi.advanceTimersByTime(WORKER_IDLE_TTL_MS);

  expect(entry.msger.terminate).not.toHaveBeenCalled();
  expect(workers.has(1)).toBe(true);
  // runShrink 执行后应清掉计时器引用
  expect(entry.shrinkTimer).toBeUndefined();
});

test('reused during cooldown: cancelShrink cancels the pending termination', () => {
  seedIdle(4);
  const entry = workers.get(1)!;

  scheduleShrink(1);
  // 模拟 bindNewPath 复用该 Worker：pathCount 升起后取消计时
  entry.pathCount += 1;
  cancelShrink(1);
  expect(entry.shrinkTimer).toBeUndefined();

  vi.advanceTimersByTime(WORKER_IDLE_TTL_MS);
  expect(entry.msger.terminate).not.toHaveBeenCalled();
  expect(workers.has(1)).toBe(true);
});

test('already cooling down: repeated scheduleShrink does not create a new timer', () => {
  seedIdle(4);
  const entry = workers.get(1)!;

  scheduleShrink(1);
  const first = entry.shrinkTimer;
  scheduleShrink(1);
  // 句柄不变，说明未重复安排
  expect(entry.shrinkTimer).toBe(first);

  vi.advanceTimersByTime(WORKER_IDLE_TTL_MS);
  // 仅销毁一次
  expect(entry.msger.terminate).toHaveBeenCalledTimes(1);
});

test('pathCount>0 when timer fires (busy but cancel skipped): re-check keeps it alive', () => {
  seedIdle(4);
  const entry = workers.get(1)!;

  scheduleShrink(1);
  // 期间被占用但未经 cancelShrink（例如异常路径）；runShrink 到期应重判定保活
  entry.pathCount = 2;
  vi.advanceTimersByTime(WORKER_IDLE_TTL_MS);

  expect(entry.msger.terminate).not.toHaveBeenCalled();
  expect(workers.has(1)).toBe(true);
  expect(entry.shrinkTimer).toBeUndefined();
});

test('busy worker (pathCount>0) is not scheduled for cooldown', () => {
  workers.set(1, fakeEntry(1));
  scheduleShrink(1);
  expect(workers.get(1)!.shrinkTimer).toBeUndefined();
});

test('handleWorkerFatal: clears pending timer and unbinds its paths', () => {
  seedIdle(4);
  const entry = workers.get(1)!;
  pathBindings.set('/p1', { workerId: 1, openCount: 1 });
  pathBindings.set('/p2', { workerId: 2, openCount: 1 });

  scheduleShrink(1);
  handleWorkerFatal(1);

  // 立即移除该 Worker 及其名下 path，其他 Worker 的绑定保留
  expect(workers.has(1)).toBe(false);
  expect(pathBindings.has('/p1')).toBe(false);
  expect(pathBindings.has('/p2')).toBe(true);

  // 计时器已被 clearTimeout，到期不会对已移除的 Worker 触发 terminate
  vi.advanceTimersByTime(WORKER_IDLE_TTL_MS);
  expect(entry.msger.terminate).not.toHaveBeenCalled();
});

// 额外兜底：即便 handleWorkerFatal 未提前清计时，runShrink 内的存在性判定也不应抛错。
test('runShrink is a safe no-op for a non-existent workerId', () => {
  expect(() => runShrink(999)).not.toThrow();
});
