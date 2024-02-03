export async function mkdir(dirPath: string) {
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
}

// async function mkParents(filePath: string) {
//   const lastDirPos = filePath.lastIndexOf('/');
//   const dirPath = lastDirPos === -1 ? '/' : filePath.slice(0, lastDirPos);

//   await mkdir(dirPath);
// }
