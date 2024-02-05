import { expect, test } from 'vitest';
import { exists, mkdir } from '../directories';
import { file } from '../file';

test('mkdir', async () => {
  await mkdir('/a/b/c');
  const root = await navigator.storage.getDirectory();
  const dirA = await root.getDirectoryHandle('a');
  const dirB = await dirA.getDirectoryHandle('b');
  expect(await dirB.getDirectoryHandle('c')).toBeInstanceOf(
    FileSystemDirectoryHandle,
  );
});

// todo: for waiting 'remove' method
// test('dir exists', async () => {
//   const dirPath = '/unit-test/dir/';
//   expect(await exists(dirPath)).toBe(false);
//   await mkdir(dirPath);
//   expect(await exists(dirPath)).toBe(true);
// });

// test('file exists', async () => {
//   const filePath = '/unit-test/file';
//   expect(await exists(filePath)).toBe(false);
//   expect(await file(filePath).text()).toBe('');
// });
