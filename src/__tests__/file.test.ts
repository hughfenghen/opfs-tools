import { expect, test, afterEach, beforeEach } from 'vitest';
import { file, write } from '../file';
import { dir } from '../directory';

const filePath = '/unit-test/file';

beforeEach(async () => {
  await file(filePath).remove();
});

afterEach(async () => {
  await file(filePath).remove();
});

test('write string to file', async () => {
  await write(filePath, 'foo');
  expect(await file(filePath).text()).toBe('foo');

  await write(filePath, 'bar');
  expect(await file(filePath).text()).toBe('bar');
});

test('append data to file', async () => {
  const f1 = file(filePath);
  await write(f1, 'foo');
  expect(await f1.text()).toBe('foo');

  const f2 = file('/unit-test/file2');
  await write(f2, 'bar');

  await write(f1, f2, { overwrite: false });
  await f2.remove();
  expect(await f1.text()).toBe('foobar');
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
    readData.set(value, pos);
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
  const f = file(filePath);
  await f.remove();

  expect(await f.exists()).toBe(false);

  await write(f, '');
  expect(await f.exists()).toBe(true);

  await f.remove();
});

test('move file', async () => {
  await write(filePath, 'foo');
  const root = dir('/');
  await file(filePath).moveTo(root);
  expect(await file(filePath).exists()).toBe(false);
  await root.remove();
});

test('move file, current file not exists', async () => {
  expect(async () => {
    await file(filePath).moveTo(dir('/'));
  }).rejects.toThrowError();
});

test('copy file to dir', async () => {
  await write(filePath, 'foo');
  const oldFile = file(filePath);
  const root = dir('/');
  await oldFile.copyTo(root);
  const newFile = file(`/${oldFile.name}`);
  expect(await newFile.exists()).toBe(true);
  expect(await oldFile.exists()).toBe(true);

  await newFile.remove();
});

test('copy file to another file', async () => {
  await write(filePath, 'foo');
  const oldFile = file(filePath);

  const newFile = file('/abc');
  await oldFile.copyTo(newFile);
  expect(newFile.path).toBe('/abc');
  expect(await newFile.text()).toBe('foo');

  await file('/abc').remove();
});

test('copy to file handle', async () => {
  await write(filePath, 'foo');
  const oldFile = file(filePath);
  const newFileHandle = await (
    await navigator.storage.getDirectory()
  ).getFileHandle('bar', { create: true });

  await oldFile.copyTo(newFileHandle);
  expect(await (await newFileHandle.getFile()).text()).toBe('foo');
  await file('/bar').remove();
});

test('close reader twice', async () => {
  await write(filePath, 'foo');
  const f = file(filePath);
  const reader = await f.createReader();
  await reader.close();
  await reader.close();
});

test('multiple handler for single file', async () => {
  const rwFile = file(filePath, 'rw');
  const readOnlyFile1 = file(filePath, 'r');
  const readOnlyFile2 = file(filePath, 'r');

  await write(rwFile, '111');

  expect(readOnlyFile1).not.toBe(readOnlyFile2);
  expect(await readOnlyFile1.text()).toBe('111');
  expect(await readOnlyFile2.text()).toBe('111');
});

test('read-only file dont write', async () => {
  expect(async () => {
    await write(file(filePath, 'r'), '111');
  }).rejects.toThrowError('file is read-only');
});

test('unsafe write same file', async () => {
  const f1 = file(filePath, 'rw-unsafe');
  const f2 = file(filePath, 'rw-unsafe');
  expect(f1.path).toBe(f2.path);
  expect(f1).not.toBe(f2);

  await write(f1, '111');
  await write(f1, '222');

  expect(await f2.text()).toBe('222');
});
