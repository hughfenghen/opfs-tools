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
  onIdle,
} = __test__;

// 伪造一个 WorkerEntry：terminate 为间谍，postMsg 为空实现，避免创建真实 OPFSWorker。
// idle 取代原 pathCount 作为「是否可冷却」的判据（由 opfs-worker 的句柄全闭信号驱动）。
function fakeEntry(idle = true) {
  return {
    msger: {
      postMsg: (async () => undefined) as any,
      terminate: vi.fn(),
    },
    pathCount: 0,
    idle,
  };
}

// 向池中注入 n 个空闲（idle===true）伪造 Worker，id 从 1 起。
function seedIdle(n: number) {
  for (let i = 1; i <= n; i++) workers.set(i, fakeEntry(true));
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
  // 到期：重判定仍 idle 且 size>MIN → terminate + delete
  expect(entry.msger.terminate).toHaveBeenCalledTimes(1);
  expect(workers.has(1)).toBe(false);
});

test('runShrink terminate connectedly clears that worker pathBindings', () => {
  seedIdle(4);
  pathBindings.set('/a', 1);
  pathBindings.set('/b', 1);
  pathBindings.set('/c', 2);

  scheduleShrink(1);
  vi.advanceTimersByTime(WORKER_IDLE_TTL_MS);

  // worker 1 被销毁，其名下 /a /b 绑定一并清除；worker 2 的 /c 保留
  expect(workers.has(1)).toBe(false);
  expect(pathBindings.has('/a')).toBe(false);
  expect(pathBindings.has('/b')).toBe(false);
  expect(pathBindings.has('/c')).toBe(true);
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

test('onIdle: marks idle, schedules cooldown, terminates after TTL above floor', () => {
  seedIdle(MIN_WORKERS); // 1..3 idle
  workers.set(4, fakeEntry(false)); // 一个繁忙 Worker，size 4 > MIN
  const entry = workers.get(4)!;

  onIdle(4);
  expect(entry.idle).toBe(true);
  expect(entry.shrinkTimer).not.toBeUndefined();

  vi.advanceTimersByTime(WORKER_IDLE_TTL_MS);
  expect(entry.msger.terminate).toHaveBeenCalledTimes(1);
  expect(workers.has(4)).toBe(false);
});

test('reused during cooldown: idle=false + cancelShrink cancels the pending termination', () => {
  seedIdle(4);
  const entry = workers.get(1)!;

  scheduleShrink(1);
  // 模拟 markBusy：open 转发到该 Worker，置忙后取消计时
  entry.idle = false;
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

test('idle flipped to false before timer fires: re-check keeps it alive', () => {
  seedIdle(4);
  const entry = workers.get(1)!;

  scheduleShrink(1);
  // 期间被置忙但未经 cancelShrink（例如异常路径）；runShrink 到期应重判定保活
  entry.idle = false;
  vi.advanceTimersByTime(WORKER_IDLE_TTL_MS);

  expect(entry.msger.terminate).not.toHaveBeenCalled();
  expect(workers.has(1)).toBe(true);
  expect(entry.shrinkTimer).toBeUndefined();
});

test('non-idle worker is not scheduled for cooldown', () => {
  workers.set(1, fakeEntry(false));
  scheduleShrink(1);
  expect(workers.get(1)!.shrinkTimer).toBeUndefined();
});

test('handleWorkerFatal: clears pending timer and unbinds its paths', () => {
  seedIdle(4);
  const entry = workers.get(1)!;
  pathBindings.set('/p1', 1);
  pathBindings.set('/p2', 2);

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

// 额外兜底：onIdle 对不存在的 workerId 不抛错。
test('onIdle is a safe no-op for a non-existent workerId', () => {
  expect(() => onIdle(999)).not.toThrow();
});
