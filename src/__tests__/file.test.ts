import { expect, test } from 'vitest';
import { file, write } from '../file';

const filePath = '/unit-test/file';
test('write string to file', async () => {
  await write(filePath, 'foo');
  expect(await file(filePath).text()).toBe('foo');

  await write(filePath, 'bar');
  expect(await file(filePath).text()).toBe('bar');
});

test('multiple write operations', async () => {
  const f = file(filePath);
  const writer = await f.createWritable();

  await writer.write(new Uint8Array([1, 1, 1, 1, 1]));
  await writer.write(new Uint8Array([2, 2, 2, 2, 2]));

  await writer.close();

  expect(await f.arrayBuffer()).toEqual(
    new Uint8Array([1, 1, 1, 1, 1, 2, 2, 2, 2, 2]).buffer
  );
});
