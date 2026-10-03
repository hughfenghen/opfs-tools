import { test, expect, vi, afterEach } from 'vitest';
import {
  clearUnusedTMPFiles,
  delByInterval,
  holdFileLock,
  isFileHeld,
  tmpfile,
} from '../tmpfile';
import { file, write } from '../file';

const TMP_DIR = '/.opfs-tools-temp-dir';

function randName() {
  return `${Math.random().toString().slice(2)}-${Date.now()}`;
}

// tmpfile() 内部异步请求锁，轮询等待其被授予
async function waitUntilHeld(name: string) {
  for (let i = 0; i < 100; i++) {
    if (await isFileHeld(name)) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`lock of ${name} was not granted in time`);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('Web Locks is available in the test environment', () => {
  // 以下用例依赖真实 Web Locks 行为
  expect(navigator.locks).not.toBeNull();
});

test('holdFileLock then isFileHeld reports held', async () => {
  const name = randName();
  expect(await isFileHeld(name)).toBe(false);

  await holdFileLock(name); // resolve 即代表锁已被授予
  expect(await isFileHeld(name)).toBe(true);
});

test('tmpfile holds a lock so it survives cleanup', async () => {
  const f = tmpfile();
  await waitUntilHeld(f.name); // 等待 tmpfile 内部的锁被授予
  await write(f, 'in-use');
  expect(await f.exists()).toBe(true);

  await clearUnusedTMPFiles();

  // 当前页面仍持有锁 => 不应被删除
  expect(await file(f.path).exists()).toBe(true);
});

test('clearUnusedTMPFiles removes files not held by any live session', async () => {
  // 模拟“上个会话遗留”的临时文件：命名合法但没有任何页面持有其锁
  const orphanName = randName();
  const orphan = file(`${TMP_DIR}/${orphanName}`);
  await write(orphan, 'orphan');
  expect(await orphan.exists()).toBe(true);
  expect(await isFileHeld(orphanName)).toBe(false);

  await clearUnusedTMPFiles();

  // 无人持有 => 被回收
  expect(await file(orphan.path).exists()).toBe(false);
});

test('clearUnusedTMPFiles only removes the unheld one, keeps the held one', async () => {
  // 被持有的文件：直接请求一把锁并手动建文件，避免对同名文件重复加锁
  const heldName = randName();
  await holdFileLock(heldName);
  const held = file(`${TMP_DIR}/${heldName}`);
  await write(held, 'held');

  // 未被持有的遗留文件
  const orphanName = randName();
  const orphan = file(`${TMP_DIR}/${orphanName}`);
  await write(orphan, 'orphan');

  await clearUnusedTMPFiles();

  expect(await file(held.path).exists()).toBe(true);
  expect(await file(orphan.path).exists()).toBe(false);
});

test('delByInterval periodically cleans unheld files', async () => {
  // 先用真实计时器写入一个遗留文件
  const orphanName = randName();
  const orphan = file(`${TMP_DIR}/${orphanName}`);
  await write(orphan, 'periodic');
  expect(await orphan.exists()).toBe(true);

  vi.useFakeTimers();
  delByInterval();

  // 触发定时回调并等待其异步清理完成
  await vi.advanceTimersToNextTimerAsync();
  await new Promise((resolve) => {
    vi.useRealTimers();
    setTimeout(resolve, 100);
    vi.useFakeTimers();
  });
  vi.clearAllTimers();
  vi.useRealTimers();

  expect(await file(orphan.path).exists()).toBe(false);
});
