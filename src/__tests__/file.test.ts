import { expect, test } from 'vitest';
import { file, write } from '../file';

const filePath = '/unit-test/file';

test('write string to file', async () => {
  await write(filePath, 'foo');
  expect(await file(filePath).text()).toBe('foo');

  await write(filePath, 'bar');
  expect(await file(filePath).text()).toBe('bar');
});

test('write stream to file', async () => {
  await write(
    filePath,
    new Blob(['I 🩷 坤坤\n'], { type: 'text/plain' }).stream()
  );
  expect(await file(filePath).text()).toBe('I 🩷 坤坤\n');
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

test('write operation is exclusive', async () => {
  const f = file(filePath);
  const writer = await f.createWriter();
  expect(async () => {
    await f.createWriter();
  }).rejects.toThrowError(Error('Other writer have not been closed'));

  await writer.close();
});

test('read operations can be parallelized', async () => {
  const str = 'hello world';
  await write(filePath, 'hello world');
  const f = file(filePath);
  const reader = await f.createReader();

  expect(await Promise.all([reader.read(0, 11), f.text()])).toEqual([
    new TextEncoder().encode(str).buffer,
    'hello world',
  ]);
});

test('file to stream', async () => {
  const writeData = new Uint8Array(Array(4 * 1024).fill(1));
  await write(filePath, writeData.slice(0));
  const stream = await file(filePath).stream();
  const reader = stream.getReader();

  const readData = new Uint8Array(writeData.byteLength);
  let pos = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    readData.set(new Uint8Array(value), pos);
    pos += value.byteLength;
  }
  expect(writeData).toEqual(readData);
});

test('get file size', async () => {
  const str = 'I 🩷 坤坤\n';
  await write(filePath, str);
  expect(await file(filePath).getSize()).toBe(
    new TextEncoder().encode(str).byteLength // => 14
  );
});
