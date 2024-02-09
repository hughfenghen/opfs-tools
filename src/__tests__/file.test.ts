import { expect, test } from 'vitest';
import { file, write } from '../file';

const filePath = '/unit-test/file';

test('write string to file', async () => {
  const fp = filePath + '1';
  await write(fp, 'foo');
  expect(await file(fp).text()).toBe('foo');

  await write(fp, 'bar');
  expect(await file(fp).text()).toBe('bar');
});

test('write stream to file', async () => {
  const fp = filePath + '2';
  await write(fp, new Blob(['I 🩷 坤坤\n'], { type: 'text/plain' }).stream());
  expect(await file(fp).text()).toBe('I 🩷 坤坤\n');
});

test('multiple write operations', async () => {
  const fp = filePath + '3';
  const f = file(fp);
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
  const fp = filePath + '4';
  await write(fp, new Uint8Array([1, 1, 1, 1, 1, 2, 2, 2, 2, 2]));
  const reader = await file(fp).createReader();

  expect(new Uint8Array(await reader.read(5, { at: 3 }))).toEqual(
    new Uint8Array([1, 1, 2, 2, 2])
  );
  await reader.close();

  expect(async () => {
    await reader.read(5);
  }).rejects.toThrowError(Error('Reader is closed'));
});

test('write operation is exclusive', async () => {
  const fp = filePath + '5';
  const f = file(fp);
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
  const fp = filePath + '6';
  const str = 'hello world';
  await write(fp, 'hello world');
  const f = file(fp);
  const reader = await f.createReader();

  expect(await Promise.all([reader.read(11, { at: 0 }), f.text()])).toEqual([
    new TextEncoder().encode(str).buffer,
    'hello world',
  ]);
});

test('file to stream', async () => {
  const fp = filePath + '7';
  const writeData = new Uint8Array(Array(4 * 1024).fill(1));
  await write(fp, writeData.slice(0));
  const stream = await file(fp).stream();
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
  const fp = filePath + '8';
  const str = 'I 🩷 坤坤\n';
  await write(fp, str);
  expect(await file(fp).getSize()).toBe(
    new TextEncoder().encode(str).byteLength // => 14
  );
});

test('random access', async () => {
  const fp = filePath + '9';
  const f = file(fp);
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
