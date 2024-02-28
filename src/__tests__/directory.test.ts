import { expect, test } from 'vitest';
import { dir } from '../directory';
import { file } from '../file';

const filePath = '/unit-test/dir';

test('dir exists', async () => {
  const d = dir(filePath + '1');
  await d.remove();
  expect(await d.exists()).toBe(false);
  await d.create();
  expect(await d.exists()).toBe(true);
  await d.remove();
});

test('dir children', async () => {
  const path = filePath + '2';
  const d = dir(path);
  await d.remove();
  expect(await d.children()).toEqual([]);

  expect(await file(`${path}/1`).getSize()).toBe(0);
  expect(await d.children()).toEqual([file(`${path}/1`)]);

  await d.remove();
});
