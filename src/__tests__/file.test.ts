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
  const writer = await f.createWriter();

  await writer.write(new Uint8Array([1, 1, 1, 1, 1]));
  await writer.write(new Uint8Array([2, 2, 2, 2, 2]));

  await writer.close();

  expect(await f.arrayBuffer()).toEqual(
    new Uint8Array([1, 1, 1, 1, 1, 2, 2, 2, 2, 2]).buffer
  );
});

test('read part of a file', async () => {
  await write(filePath, new Uint8Array([1, 1, 1, 1, 1, 2, 2, 2, 2, 2]));
  const reader = await file(filePath).createReader();

  expect(await reader.read(3, 5)).toEqual(
    new Uint8Array([1, 1, 2, 2, 2]).buffer
  );
  await reader.close();
});
