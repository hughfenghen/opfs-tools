import { expect, test, afterEach, beforeEach } from 'vitest';
import { file, write } from '../file';
import { dir } from '../directory';

const filePath = '/unit-test/file';

beforeEach(async () => {
  await file(filePath).remove({ force: true });
});

afterEach(async () => {
  await file(filePath).remove({ force: true });
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
  }).rejects.toThrowError('Reader is closed');
});

test('write operation is exclusive', async () => {
  const f = file(filePath);
  const writer = await f.createWriter();
  expect(async () => {
    await f.createWriter();
  }).rejects.toThrowError('file is locked by another writer');

  await writer.close();

  expect(async () => {
    await writer.write('44444');
  }).rejects.toThrowError('Writer is closed');
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
  const f1 = file(filePath);
  const f2 = file(filePath);

  await write(f1, '111');

  // 同一路径返回同一缓存实例
  expect(f1).toBe(f2);
  // 全 origin 共享唯一句柄，并发读自动排队
  expect(await Promise.all([f1.text(), f2.text()])).toEqual(['111', '111']);
});

test('sequential writes to same file', async () => {
  // 顺序写：前一个 writer close 释放锁后，下一个才能获取
  await write(file(filePath), '111');
  await write(file(filePath), '222');

  expect(await file(filePath).text()).toBe('222');
});

test('remove file when unclos reader', async () => {
  const f = file(filePath);
  await write(f, '111');
  const reader = await f.createReader();
  expect(async () => {
    await f.remove();
  }).rejects.toThrowError('exists unclosed reader/writer');
  await reader.close();
  await f.remove();
});

test('force remove file', async () => {
  const f = file(filePath);
  await write(f, '111');
  await f.createReader();
  await f.remove({ force: true });
  expect(await f.exists()).toBe(false);
});

test('await using auto-closes writer on scope exit', async () => {
  const f = file(filePath);
  let writer: Awaited<ReturnType<typeof f.createWriter>>;
  {
    await using w = await f.createWriter();
    writer = w;
    await w.truncate(0);
    await w.write('using');
  }
  // 作用域退出后句柄已关闭：再写抛错，且单写者锁已释放可再次获取 writer
  await expect(async () => {
    await writer.write('x');
  }).rejects.toThrowError('Writer is closed');
  const w2 = await f.createWriter();
  await w2.close();

  expect(await f.text()).toBe('using');
});

test('await using auto-closes reader on scope exit', async () => {
  await write(filePath, 'using-reader');
  const f = file(filePath);
  let reader: Awaited<ReturnType<typeof f.createReader>>;
  {
    await using r = await f.createReader();
    reader = r;
    expect(new TextDecoder().decode(await r.read(5, { at: 0 }))).toBe('using');
  }
  await expect(async () => {
    await reader.read(5);
  }).rejects.toThrowError('Reader is closed');
});

test('writer dispose is idempotent with explicit close', async () => {
  const f = file(filePath);
  const writer = await f.createWriter();
  await writer.truncate(0);
  await writer.write('ok');
  // 先手动 close，再触发 dispose：dispose 以 closed 守卫 no-op，不得抛错
  await writer.close();
  await writer[Symbol.asyncDispose]();
  // 重复触发 dispose 仍为 no-op
  await writer[Symbol.asyncDispose]();
  // dispose 释放了锁，可再次获取 writer
  const w2 = await f.createWriter();
  await w2.close();
});

test('reader dispose is idempotent with explicit close', async () => {
  await write(filePath, 'foo');
  const f = file(filePath);
  const reader = await f.createReader();
  await reader.close();
  // dispose 复用幂等 close：与显式 close 任意组合、重复触发均不抛错
  await reader[Symbol.asyncDispose]();
  await reader[Symbol.asyncDispose]();
  await reader.close();
});
