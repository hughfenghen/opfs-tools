import { expect, test, afterEach } from 'vitest';
import { file, write } from '../file';

const filePath = '/unit-test/file';

afterEach(async () => {
  await file(filePath).remove();
});

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

test('copy file', async () => {
  await write(filePath, '111');
  await write('file copy', file(filePath));
  expect(await file('file copy').text()).toBe('111');
  await file('file copy').remove();
});

test('multiple write operations', async () => {
  const f = file(filePath);
  const writer = await f.createWriter();

  await writer.truncate(0);
  await writer.write(new Uint8Array([1, 1, 1, 1, 1]));
  await writer.write(new Uint8Array([2, 2, 2, 2, 2]));

  await writer.close();

  expect(new Uint8Array(await f.arrayBuffer())).toEqual(
    new Uint8Array([1, 1, 1, 1, 1, 2, 2, 2, 2, 2])
  );
});

test('read part of a file', async () => {
  await write(filePath, new Uint8Array([1, 1, 1, 1, 1, 2, 2, 2, 2, 2]));
  const reader = await file(filePath).createReader();

  expect(new Uint8Array(await reader.read(5, { at: 3 }))).toEqual(
    new Uint8Array([1, 1, 2, 2, 2])
  );
  await reader.close();

  expect(async () => {
    await reader.read(5);
  }).rejects.toThrowError(Error('Reader is closed'));
});

test('write operation is exclusive', async () => {
  const f = file(filePath);
  const writer = await f.createWriter();
  expect(async () => {
    await f.createWriter();
  }).rejects.toThrowError(Error('Other writer have not been closed'));

  await writer.close();

  expect(async () => {
    await writer.write('44444');
  }).rejects.toThrowError(Error('Writer is closed'));
});

test('read operations can be parallelized', async () => {
  const str = 'hello world';
  await write(filePath, 'hello world');
  const f = file(filePath);
  const reader = await f.createReader();

  expect(await Promise.all([reader.read(11, { at: 0 }), f.text()])).toEqual([
    new TextEncoder().encode(str).buffer,
    'hello world',
  ]);
  await reader.close();
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

test('random access', async () => {
  const f = file(filePath);
  const reader = await f.createReader();
  const writer = await f.createWriter();

  await writer.truncate(0);
  await writer.write('11111');

  const txtDC = new TextDecoder();
  expect(txtDC.decode(await reader.read(5, { at: 0 }))).toBe('11111');

  await writer.write('22222', { at: 3 });
  expect(txtDC.decode(await reader.read(10, { at: 0 }))).toBe('11122222');

  await writer.write('33333');
  expect(txtDC.decode(await reader.read(15, { at: 0 }))).toBe('1112222233333');

  await writer.truncate(0);
  expect(await reader.getSize()).toBe(0);

  await reader.close();
  await writer.close();
});

test('file exists', async () => {
  const f = file(filePath + '10');
  await f.remove();

  expect(await f.exists()).toBe(false);
  // auto create
  expect(await f.getSize()).toBe(0);
  expect(await f.exists()).toBe(true);

  await f.remove();
});
