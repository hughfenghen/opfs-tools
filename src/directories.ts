import { getFSHandle, remove } from './common';

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
  };
}
