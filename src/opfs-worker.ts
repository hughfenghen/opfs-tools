import { FileSystemSyncAccessHandle, getFSHandle } from './common';

const fileAccesserMap: Record<number, FileSystemSyncAccessHandle> = {};

self.onmessage = async (e) => {
  const { evtType, args } = e.data;

  console.log(111111, args.fileId);
  let accessHandle = fileAccesserMap[args.fileId as number];

  try {
    let returnVal;
    const trans: Transferable[] = [];
    if (evtType === 'register') {
      const fh = await getFSHandle(args.filePath, {
        create: true,
        isFile: true,
      });
      if (fh == null) throw Error(`not found file: ${args.fileId}`);
      // @ts-expect-error
      accessHandle = await fh.createSyncAccessHandle({ mode: args.mode });
      fileAccesserMap[args.fileId] = accessHandle;
    } else if (evtType === 'close') {
      await accessHandle.close();
      delete fileAccesserMap[args.fileId];
    } else if (evtType === 'truncate') {
      await accessHandle.truncate(args.newSize);
    } else if (evtType === 'write') {
      const { data, opts } = e.data.args;
      returnVal = await accessHandle.write(data, opts);
    } else if (evtType === 'read') {
      const { offset, size } = e.data.args;
      const uint8Buf = new Uint8Array(size);
      const readLen = await accessHandle.read(uint8Buf, { at: offset });
      const buf = uint8Buf.buffer;
      returnVal =
        readLen === size
          ? buf
          : // @ts-expect-error transfer support by chrome 114
            buf.transfer?.(readLen) ?? buf.slice(0, readLen);
      trans.push(returnVal);
    } else if (evtType === 'getSize') {
      returnVal = await accessHandle.getSize();
    } else if (evtType === 'flush') {
      await accessHandle.flush();
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
