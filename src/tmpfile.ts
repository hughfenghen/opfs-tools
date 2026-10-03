import { OTDir, dir } from './directory';
import { OTFile, file } from './file';

const TMP_DIR = '/.opfs-tools-temp-dir';

// 每个临时文件对应一把 Web Lock，名字由文件名派生。
// 创建临时文件的页面/worker 会持有这把锁直到自身被销毁（关闭、跳转、崩溃、
// 移动端进程被杀等，浏览器都会自动释放），因此“锁是否仍被持有”精确对应
// “是否还有存活的会话在使用该临时文件”。
const LOCK_PREFIX = 'opfs-tools-tmpfile:';

async function safeRemove(it: OTFile | OTDir) {
  try {
    if (it.kind === 'file') {
      if (!(await it.exists())) return true;

      const writer = await it.createWriter();
      await writer.truncate(0);
      await writer.close();
      await it.remove();
    } else {
      await it.remove();
    }
    return true;
  } catch (e) {
    console.warn(e);
    return false;
  }
}

function supportsWebLocks() {
  return globalThis.navigator?.locks != null;
}

// 为当前页面/worker 持有某临时文件的锁，直到当前上下文被销毁。
// 返回的 Promise 在锁被授予时 resolve（便于调用方/测试确认已持有）。
// 'export' is for ease of testing
export function holdFileLock(name: string): Promise<void> {
  if (!supportsWebLocks()) return Promise.resolve();
  return new Promise<void>((grantedResolve) => {
    // 回调被调用即代表已持有锁：resolve 以通知“已持有”，
    // 再返回一个永不 resolve 的 Promise 把锁一直持有到上下文销毁。
    navigator.locks
      .request(`${LOCK_PREFIX}${name}`, () => {
        grantedResolve();
        return new Promise<never>(() => {});
      })
      .catch(() => grantedResolve());
  });
}

// 判断某临时文件是否仍被某个存活的页面/worker 持有。
// 用 ifAvailable 探测：能立即拿到锁 => 无人持有 => 可安全删除。
// 'export' is for ease of testing
export async function isFileHeld(name: string): Promise<boolean> {
  if (!supportsWebLocks()) return false;
  return navigator.locks.request(
    `${LOCK_PREFIX}${name}`,
    { ifAvailable: true },
    (lock) => lock == null
  );
}

// 'export' is for ease of testing
// 扫描临时目录，删除“不再被任何存活会话持有”的临时文件。
// 支持 Web Locks 时按持有状态判断（可近实时回收）；
// 不支持时降级为按文件名时间戳删除超过三天或命名异常的文件。
export async function clearUnusedTMPFiles() {
  const timeOf3Days = 1000 * 60 * 60 * 24 * 3;
  const useLocks = supportsWebLocks();

  for (const it of await dir(TMP_DIR).children()) {
    if (useLocks) {
      if (!(await isFileHeld(it.name))) await safeRemove(it);
    } else {
      const match = /^\d+-(\d+)$/.exec(it.name);
      if (match == null || Date.now() - Number(match[1]) > timeOf3Days) {
        await safeRemove(it);
      }
    }
  }
}

// 'export' is for ease of testing
export function delByInterval() {
  setInterval(clearUnusedTMPFiles, 60 * 1000);
}

(async function init() {
  if (globalThis.__opfs_tools_tmpfile_init__ === true) return;
  globalThis.__opfs_tools_tmpfile_init__ = true;

  // not web context
  if (
    globalThis.FileSystemDirectoryHandle == null ||
    globalThis.FileSystemFileHandle == null ||
    globalThis.navigator?.storage.getDirectory == null
  ) {
    return;
  }

  // 启动时立即回收上个会话遗留的临时文件，再定时兜底。
  await clearUnusedTMPFiles();
  delByInterval();
})();

/**
 * Create a temporary file that will automatically be cleared to avoid occupying too much storage space.
 * The temporary file name will be automatically generated and stored in a specific directory.
 */
export function tmpfile() {
  const name = `${Math.random().toString().slice(2)}-${Date.now()}`;
  // 持有该文件的锁；当前上下文存活期间它不会被清理逻辑删除。
  holdFileLock(name);
  return file(`${TMP_DIR}/${name}`);
}
