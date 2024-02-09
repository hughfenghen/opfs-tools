export function splitDirAndFile(path: string, isFile: boolean) {
  if (!path.startsWith('/')) path = `/${path}`;

  const lastDirPos = path.lastIndexOf('/');
  const dirPath = !isFile
    ? path
    : lastDirPos <= 0
    ? '/'
    : path.slice(0, lastDirPos);
  const fileName = isFile === true ? path.slice(lastDirPos + 1) : '';

  return { dirPath, fileName };
}

export async function getFSHandle(
  path: string,
  opts: {
    create?: boolean;
    isFile?: boolean;
  } = {}
) {
  const { dirPath, fileName } = splitDirAndFile(path, opts.isFile ?? false);

  const dirPaths = dirPath
    .split('/')
    .slice(1)
    .filter((s) => s.length > 0);

  try {
    let dirHandle = await navigator.storage.getDirectory();
    for (const p of dirPaths) {
      dirHandle = await dirHandle.getDirectoryHandle(p, {
        create: opts.create,
      });
    }
    if (fileName.length > 0) {
      return await dirHandle.getFileHandle(fileName, { create: opts.create });
    }
    return dirHandle;
  } catch (err) {
    return null;
  }
}
