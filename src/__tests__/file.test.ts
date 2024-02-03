import { expect, test } from 'vitest';
import { file, write } from '../file';

test('write string to file', async () => {
  const filePath = '/unit-test/write-string';
  await write(filePath, 'foo');
  expect(await file(filePath).text()).toBe('foo');

  await write(filePath, 'bar');
  expect(await file(filePath).text()).toBe('bar');
});
