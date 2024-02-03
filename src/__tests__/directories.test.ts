import { expect, test } from 'vitest';
import { mkdir } from '../directories';

test('mkdir', async () => {
  await mkdir('/a/b/c');
  const root = await navigator.storage.getDirectory();
  const dirA = await root.getDirectoryHandle('a');
  const dirB = await dirA.getDirectoryHandle('b');
  expect(await dirB.getDirectoryHandle('c')).toBeInstanceOf(
    FileSystemDirectoryHandle
  );
});
