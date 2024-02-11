import { getFSHandle, remove } from './common';
import { file } from './file';

declare global {
  interface FileSystemDirectoryHandle {
    values: () => AsyncIterable<
      FileSystemDirectoryHandle | FileSystemFileHandle
    >;
  }
}

export function dir(dirPath: string) {
  return {
    create: async () => {
      await getFSHandle(dirPath, {
        create: true,
        isFile: false,
      });
      return dir(dirPath);
    },
    exists: async () => {
      return (
        (await getFSHandle(dirPath, {
          create: false,
          isFile: false,
        })) instanceof FileSystemDirectoryHandle
      );
    },
    remove: async () => {
      await remove(dirPath);
    },
    children: async () => {
      const handle = (await getFSHandle(dirPath, {
        create: false,
        isFile: false,
      })) as FileSystemDirectoryHandle;
      if (handle == null) return [];

      const rs = [];
      for await (const it of handle.values()) {
        rs.push((it.kind === 'file' ? file : dir)(`${dirPath}/${it.name}`));
      }
      return rs;
    },
  };
}
