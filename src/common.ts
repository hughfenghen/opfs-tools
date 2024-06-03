export interface FileSystemSyncAccessHandle {
  read: (container: ArrayBuffer, opts: { at: number }) => number;
  write: (data: ArrayBuffer | ArrayBufferView, opts?: { at: number }) => number;
  flush: () => void;
  close: () => void;
  truncate: (newSize: number) => void;
  getSize: () => number;
}

export function parsePath(path: string) {
  if (path === '/') return { parent: null, name: '' };

  const pathArr = path.split('/').filter((s) => s.length > 0);
  if (pathArr.length === 0) throw Error('Invalid path');

  const name = pathArr[pathArr.length - 1];

  const parent = '/' + pathArr.slice(0, -1).join('/');

  return { name, parent };
}

export async function getFSHandle<
  ISFile extends boolean,
  ISCreate extends boolean,
  T = ISFile extends true ? FileSystemFileHandle : FileSystemDirectoryHandle,
  RT = ISCreate extends true ? T : T | null
>(
  path: string,
  opts: {
    create?: ISCreate;
    isFile?: ISFile;
  }
): Promise<RT> {
  const { parent, name } = parsePath(path);

  if (parent == null) return (await navigator.storage.getDirectory()) as RT;

  const dirPaths = parent.split('/').filter((s) => s.length > 0);

  try {
    let dirHandle = await navigator.storage.getDirectory();
    for (const p of dirPaths) {
      dirHandle = await dirHandle.getDirectoryHandle(p, {
        create: opts.create,
      });
    }
    if (opts.isFile) {
      return (await dirHandle.getFileHandle(name, {
        create: opts.create,
      })) as RT;
    } else {
      return (await dirHandle.getDirectoryHandle(name, {
        create: opts.create,
      })) as RT;
    }
  } catch (err) {
    return null as RT;
  }
}

export async function remove(path: string) {
  const { parent, name } = parsePath(path);
  if (parent == null) {
    const root = await navigator.storage.getDirectory();
    for await (const it of root.keys()) {
      await root.removeEntry(it, { recursive: true });
    }
    return;
  }

  const dirHandle = (await getFSHandle(parent, {
    create: false,
    isFile: false,
  })) as FileSystemDirectoryHandle | null;
  if (dirHandle == null) return;

  await dirHandle.removeEntry(name, { recursive: true });
}

export function joinPath(p1: string, p2: string) {
  return `${p1}/${p2}`.replace('//', '/');
}
