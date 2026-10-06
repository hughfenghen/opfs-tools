import { FileSystemSyncAccessHandle, getFSHandle } from './common';

// 以 filePath 为键，持有「每个文件唯一」的 SyncAccessHandle，并对其 open/close 计数；
// count 归零即真正关闭句柄。
// 存「创建 Promise」而非句柄本身：open 时在任何 await 之前同步写入 Map，
// 使并发 open 复用同一次创建，避免对同一文件重复 createSyncAccessHandle 的竞态。
const handles = new Map<
  string,
  { handleP: Promise<FileSystemSyncAccessHandle>; count: number }
>();

type MsgData = {
  cbId: number;
  evtType: string;
  args: Record<string, any>;
};

async function handleMsg(
  data: MsgData,
  post: (msg: unknown, trans?: Transferable[]) => void
) {
  const { evtType, args, cbId } = data;
  const filePath = args.filePath as string;

  try {
    let returnVal: unknown;
    const trans: Transferable[] = [];
    let entry = handles.get(filePath);

    if (evtType === 'open') {
      // open 替代原 register：首次打开创建句柄，之后仅累加计数。
      if (entry == null) {
        const handleP = (async () => {
          const fh = await getFSHandle(filePath, {
            create: true,
            isFile: true,
          });
          if (fh == null) throw Error(`not found file: ${filePath}`);
          return await fh.createSyncAccessHandle();
        })();
        entry = { handleP, count: 0 };
        // 同步写入，确保并发 open 复用同一创建 Promise。
        handles.set(filePath, entry);
      }
      entry.count += 1;
      try {
        await entry.handleP;
      } catch (err) {
        // 创建失败：回滚计数并清理，避免条目残留卡死后续 open。
        entry.count -= 1;
        if (entry.count <= 0) handles.delete(filePath);
        throw err;
      }
    } else if (evtType === 'close') {
      if (entry != null) {
        entry.count -= 1;
        if (entry.count <= 0) {
          handles.delete(filePath);
          (await entry.handleP).close();
        }
      }
    } else if (evtType === 'forceClose') {
      if (entry != null) {
        handles.delete(filePath);
        // close() 为同步方法，返回 undefined，不能 .catch()
        try {
          (await entry.handleP).close();
        } catch {}
      }
    } else if (evtType === 'isOpen') {
      returnVal = entry != null && entry.count > 0;
    } else {
      if (entry == null) throw Error(`file not opened: ${filePath}`);
      const accessHandle = await entry.handleP;
      if (evtType === 'truncate') {
        await accessHandle.truncate(args.newSize);
      } else if (evtType === 'write') {
        returnVal = await accessHandle.write(args.data, args.opts);
      } else if (evtType === 'read') {
        const { offset, size } = args;
        const uint8Buf = new Uint8Array(size);
        const readLen = await accessHandle.read(uint8Buf, { at: offset });
        const buf = uint8Buf.buffer;
        returnVal =
          readLen === size
            ? buf
            : // @ts-expect-error transfer support by chrome 114
              buf.transfer?.(readLen) ?? buf.slice(0, readLen);
        trans.push(returnVal as ArrayBuffer);
      } else if (evtType === 'getSize') {
        returnVal = await accessHandle.getSize();
      } else if (evtType === 'flush') {
        await accessHandle.flush();
      }
    }

    post({ evtType: 'callback', cbId, returnVal }, trans);
  } catch (error) {
    const err = error as Error;
    post({
      evtType: 'throwError',
      cbId,
      errMsg: err.name + ': ' + err.message,
    });
  }
}

// Dedicated Worker：createSyncAccessHandle 仅在此作用域可用。
// 单个 tab 一个 Worker，内部按 path 持唯一句柄并计数。
const globalScope = self as any;
globalScope.onmessage = (ev: any) =>
  handleMsg(ev.data, (msg, trans = []) => globalScope.postMessage(msg, trans));
