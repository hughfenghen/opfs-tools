import { expect, test } from 'vitest';
import { dir } from '../directory';

const filePath = '/unit-test/dir';

test('dir exists', async () => {
  const d = dir(filePath + '1');
  await d.remove();
  expect(await d.exists()).toBe(false);
  await d.create();
  expect(await d.exists()).toBe(true);
  await d.remove();
});
