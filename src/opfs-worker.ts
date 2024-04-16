import { FileSystemSyncAccessHandle, getFSHandle } from './common';

const fileAccesserMap: Record<string, FileSystemSyncAccessHandle> = {};

self.onmessage = async (e) => {
  const { evtType, args } = e.data;

  let accessHandle = fileAccesserMap[args.filePath];

  try {
    let returnVal;
    const trans: Transferable[] = [];
    if (evtType === 'register') {
      const fh =
        args.fileHandle ??
        ((await getFSHandle(args.filePath, {
          create: true,
          isFile: true,
        })) as FileSystemFileHandle);
      accessHandle = await fh.createSyncAccessHandle();
      fileAccesserMap[args.filePath] = accessHandle;
    } else if (evtType === 'close') {
      accessHandle.close();
      delete fileAccesserMap[args.filePath];
    } else if (evtType === 'truncate') {
      accessHandle.truncate(args.newSize);
    } else if (evtType === 'write') {
      const { data, opts } = e.data.args;
      returnVal = accessHandle.write(data, opts);
    } else if (evtType === 'read') {
      const { offset, size } = e.data.args;
      const buf = new ArrayBuffer(size);
      const readLen = accessHandle.read(buf, { at: offset });
      returnVal =
        readLen === size
          ? buf
          : // @ts-expect-error transfer support by chrome 114
            buf.transfer?.(readLen) ?? buf.slice(0, readLen);
      trans.push(returnVal);
    } else if (evtType === 'getSize') {
      returnVal = accessHandle.getSize();
    } else if (evtType === 'flush') {
      accessHandle.flush();
    }

    self.postMessage(
      {
        evtType: 'callback',
        cbId: e.data.cbId,
        returnVal,
      },
      // @ts-expect-error
      trans
    );
  } catch (error) {
    const err = error as Error;
    self.postMessage({
      evtType: 'throwError',
      cbId: e.data.cbId,
      errMsg: err.name + ': ' + err.message + '\n' + JSON.stringify(e.data),
    });
  }
};
