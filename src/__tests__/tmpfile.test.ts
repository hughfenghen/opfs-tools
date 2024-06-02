import { test, expect, vi, beforeAll } from 'vitest';
import { delByInterval, delMarkFiles, tmpfile } from '../tmpfile';
import { file, write } from '../file';

beforeAll(() => {
  vi.useFakeTimers();
});

test('delByInterval', async () => {
  const spyNow = vi.spyOn(Date, 'now');
  spyNow.mockReturnValue(0);
  const f = tmpfile();
  await write(f, 'interval');
  expect(await f.exists()).toBe(true);

  spyNow.mockReturnValue(1000 * 60 * 60 * 24 * 3.1);
  delByInterval();
  await vi.advanceTimersToNextTimerAsync();
  await new Promise((resolve) => {
    vi.useRealTimers();
    setTimeout(resolve, 100);
    vi.useFakeTimers();
  });
  spyNow.mockRestore();
  expect(await file(f.path).exists()).toBe(false);
  vi.clearAllTimers();
});

test('delMarkFiles', async () => {
  const f = tmpfile();
  await write(f, 'mark');
  expect(await f.exists()).toBe(true);
  self.dispatchEvent(new Event('unload'));
  expect(
    localStorage.getItem('OPFS_TOOLS_EXPIRES_TMP_FILES')?.includes(f.name)
  ).toBe(true);
  await delMarkFiles();
  expect(localStorage.getItem('OPFS_TOOLS_EXPIRES_TMP_FILES')).toBe(',');
  expect(await f.exists()).toBe(false);
});
