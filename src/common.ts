export function parsePath(path: string) {
  if (path === '/') return { parent: '/', name: '' };

  const pathArr = path.split('/').filter((s) => s.length > 0);
  if (pathArr.length === 0) throw Error('Invalid path');

  const name = pathArr[pathArr.length - 1];

  const parent = '/' + pathArr.slice(0, -1).join('/');

  return { name, parent };
}

export async function getFSHandle(
  path: string,
  opts: {
    create?: boolean;
    isFile?: boolean;
  }
) {
  const { parent, name } = parsePath(path);

  const dirPaths = parent.split('/').filter((s) => s.length > 0);

  try {
    let dirHandle = await navigator.storage.getDirectory();
    for (const p of dirPaths) {
      dirHandle = await dirHandle.getDirectoryHandle(p, {
        create: opts.create,
      });
    }
    if (opts.isFile) {
      return await dirHandle.getFileHandle(name, { create: opts.create });
    } else {
      return await dirHandle.getDirectoryHandle(name, { create: opts.create });
    }
  } catch (err) {
    return null;
  }
}
