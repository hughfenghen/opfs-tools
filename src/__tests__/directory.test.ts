import { afterEach, expect, test } from 'vitest';
import { dir } from '../directory';
import { file, write } from '../file';
import { joinPath } from '../common';

const filePath = '/unit-test/dir';

afterEach(async () => {
  await dir(filePath).remove();
});

test('dir exists', async () => {
  const d = dir(filePath);
  await d.remove();
  expect(await d.exists()).toBe(false);
  await d.create();
  expect(await d.exists()).toBe(true);
});

test('dir children', async () => {
  const path = filePath;
  const d = dir(path);
  await d.remove();
  expect(await d.children()).toEqual([]);

  const nf = file(`${path}/1`);
  await write(nf, '');
  expect(await d.children()).toEqual([nf]);
  await nf.remove();
});

test('move dir, dest not exists', async () => {
  await write(filePath + '/a', 'aaa');
  await write(filePath + '/b/c', 'ccc');
  expect(await file(filePath + '/b/c').text()).toBe('ccc');

  await dir('/.Trush').remove();
  const trushDir = dir('/.Trush');
  await dir(filePath).moveTo(trushDir);

  expect(await dir('/.Trush/b').exists()).toBe(true);
  expect(await file('/.Trush/a').text()).toBe('aaa');
  expect(await file('/.Trush/b/c').text()).toBe('ccc');

  expect(await dir(filePath).exists()).toBe(false);

  await trushDir.remove();
});

test('move dir, dest is exists', async () => {
  await write(filePath + '/a', 'aaa');
  await write(filePath + '/b/c', 'ccc');

  const curDir = dir(filePath);
  const trushDir = await dir('/.Trush').create();
  await curDir.moveTo(trushDir);

  expect(await dir(`/.Trush/${curDir.name}/b`).exists()).toBe(true);
  expect(await file(`/.Trush/${curDir.name}/a`).text()).toBe('aaa');
  expect(await file(`/.Trush/${curDir.name}/b/c`).text()).toBe('ccc');

  await trushDir.remove();
});

test('remove dir', async () => {
  const f = file(filePath + '/a');
  await write(f, 'aaa');
  await write(filePath + '/b/c', 'bbbccc');
  const d = dir(filePath);
  const reader = await f.createReader();
  expect((await d.children()).length).toBe(2);
  await d.remove();
  expect((await d.children()).length).toBe(1);

  await reader.close();
  await d.remove();
  expect(await d.exists()).toBe(false);
});

test('copy to dir handle', async () => {
  const d = dir(filePath);
  await write(joinPath(filePath, 'a'), 'aaa');
  const dirHandle = await (
    await navigator.storage.getDirectory()
  ).getDirectoryHandle('abc', { create: true });
  await d.copyTo(dirHandle);

  expect(
    await (await (await dirHandle.getFileHandle('a')).getFile()).text()
  ).toBe('aaa');
  await dir('/abc').remove();
});
