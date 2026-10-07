import { FileSystemSyncAccessHandle, getFSHandle } from './common';

// 以 filePath 为键，持有「每个文件唯一」的 SyncAccessHandle，并对其 open/close 计数；
// count 归零即真正关闭句柄。
const handles = new Map<
  string,
  { handleP: FileSystemSyncAccessHandle; count: number }
>();

type MsgData = {
  cbId: number;
  evtType: string;
  args: Record<string, any>;
};

// handles 由非空变为空时，向池侧发一条「空闲」信号（非回调消息，无 cbId），
// 由 access-worker 据此启动该 Worker 的冷却回收倒计时。
function emitIdleIfEmpty(post: (msg: unknown, trans?: Transferable[]) => void) {
  if (handles.size === 0) post({ evtType: 'idle' });
}

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
        const fh = await getFSHandle(filePath, {
          create: true,
          isFile: true,
        });
        if (fh == null) throw Error(`not found file: ${filePath}`);
        const handleP = await fh.createSyncAccessHandle();
        entry = { handleP, count: 0 };
        // 同步写入，确保并发 open 复用同一创建 Promise。
        handles.set(filePath, entry);
      }
      entry.count += 1;
      try {
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
          entry.handleP.close();
          // 本 Worker 句柄已全部关闭 → 通知池侧启动空闲冷却。
          emitIdleIfEmpty(post);
        }
      }
    } else if (evtType === 'forceClose') {
      if (entry != null) {
        handles.delete(filePath);
        // close() 为同步方法，返回 undefined，不能 .catch()
        try {
          entry.handleP.close();
        } catch (err) {
          throw err;
        } finally {
          emitIdleIfEmpty(post);
        }
      }
    } else if (evtType === 'isOpen') {
      returnVal = entry != null && entry.count > 0;
    } else {
      if (entry == null) throw Error(`file not opened: ${filePath}`);
      const accessHandle = entry.handleP;
      if (evtType === 'truncate') {
        accessHandle.truncate(args.newSize);
      } else if (evtType === 'write') {
        returnVal = accessHandle.write(args.data, args.opts);
      } else if (evtType === 'read') {
        const { offset, size } = args;
        const uint8Buf = new Uint8Array(size);
        const readLen = accessHandle.read(uint8Buf, { at: offset });
        const buf = uint8Buf.buffer;
        returnVal =
          readLen === size
            ? buf
            : // @ts-expect-error transfer support by chrome 114
              buf.transfer?.(readLen) ?? buf.slice(0, readLen);
        trans.push(returnVal as ArrayBuffer);
      } else if (evtType === 'getSize') {
        returnVal = accessHandle.getSize();
      } else if (evtType === 'flush') {
        accessHandle.flush();
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
