export async function mkdirAndReturnHandle(dirPath: string) {
  if (!dirPath.startsWith('/')) dirPath = `/${dirPath}`;

  let dirHandle = await navigator.storage.getDirectory();
  const paths = dirPath
    .split('/')
    .slice(1)
    .filter((s) => s.length > 0);

  for (const p of paths) {
    dirHandle = await dirHandle.getDirectoryHandle(p, {
      create: true,
    });
  }

  return dirHandle;
}

export async function mkdir(dirPath: string) {
  await mkdirAndReturnHandle(dirPath);
}

// async function mkParents(filePath: string) {
//   const lastDirPos = filePath.lastIndexOf('/');
//   const dirPath = lastDirPos === -1 ? '/' : filePath.slice(0, lastDirPos);

//   await mkdir(dirPath);
// }

export async function exists(filePath: string) {
  if (!filePath.startsWith('/'))
    throw Error('The path must begin with the "/" character');

  const root = await navigator.storage.getDirectory();
  const paths = filePath.split('/');
  const dirNames = paths.slice(1, -1);
  const fileName = paths.at(-1) as string;
  let dirHandle;
  try {
    for (const p of dirNames) {
      dirHandle = await root.getDirectoryHandle(p, { create: false });
    }
    if (fileName !== '')
      await dirHandle?.getFileHandle(fileName, { create: false });
  } catch (err) {
    if ((err as Error).name === 'NotFoundError') return false;
    throw err;
  }
  return true;
}
