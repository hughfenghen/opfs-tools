import { expect, test } from 'vitest';
import { BinaryFile } from '../binary-file';

test('write and read', async () => {
  const bf = new BinaryFile('/unit-test/test1.txt', {
    overwrite: true,
  });
  expect(await bf.getSize()).toBe(0);

  await bf.append(new Uint8Array([0, 1, 2, 3, 4]).buffer);
  expect(await bf.getSize()).toBe(5);
  expect(await bf.read(1, 3)).toEqual(new Uint8Array([1, 2, 3]).buffer);

  await bf.append(new Uint8Array([5, 6, 7, 8, 9]).buffer);
  expect(await bf.getSize()).toBe(10);
  expect(await bf.read(8, 10)).toEqual(new Uint8Array([8, 9]).buffer);

  await bf.remove();
});
