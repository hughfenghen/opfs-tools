import { test, expect } from 'vitest';
import { rollfile } from '../rollfile';

function str(char: string, cnt: number) {
  return Array(cnt).fill(char).join('');
}

test('rolling update', async () => {
  const kb1 = 1024;
  const f = rollfile('rollfile', kb1 * 2);
  try {
    await f.append(str('1', kb1 * 2));
    const expSize1 = Math.round(kb1 * 2 * 0.7);
    expect(await f.getSize()).toBe(expSize1);
    expect(await f.text()).toBe(Array(expSize1).fill(1).join(''));

    await f.append(str('2', kb1));
    const expSize2 = Math.round((expSize1 + kb1) * 0.7);
    expect(await f.getSize()).toBe(expSize2);
    expect(await f.text()).toBe(str('1', expSize2 - kb1) + str('2', kb1));
  } finally {
    await f.remove();
  }
});
