import { OPFSDirWrap, dir } from './directory';
import { OPFSFileWrap, file } from './file';

const TMP_DIR = '/.opfs-tools-temp-dir';

async function safeRemove(it: OPFSFileWrap | OPFSDirWrap) {
  try {
    if (it.kind === 'file') {
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

// 'export' is for ease of testing
export function delByInterval() {
  setInterval(async () => {
    const timeOf3Days = 1000 * 60 * 60 * 24 * 3;
    for (const it of await dir(TMP_DIR).children()) {
      const match = /^\d+-(\d+)$/.exec(it.name);
      if (match == null || Date.now() - Number(match[1]) > timeOf3Days) {
        // Delete files that are older than three days and are not in writing
        await safeRemove(it);
      }
    }
  }, 60 * 1000);
}

const currentPageTMPFiles: string[] = [];
let bindedUnloadEvt = false;

// 'export' is for ease of testing
export async function delMarkFiles() {
  if (self.localStorage == null) return;

  const opfsToolsExpires = 'OPFS_TOOLS_EXPIRES_TMP_FILES';

  if (!bindedUnloadEvt) {
    bindedUnloadEvt = true;
    self.addEventListener('unload', () => {
      if (currentPageTMPFiles.length === 0) return;
      localStorage.setItem(
        opfsToolsExpires,
        `${
          localStorage.getItem(opfsToolsExpires) ?? ''
        },${currentPageTMPFiles.join(',')}`
      );
    });
  }

  let markStr = localStorage.getItem(opfsToolsExpires) ?? '';
  for (const name of markStr.split(',')) {
    if (name.length === 0) continue;
    if (await safeRemove(file(`${TMP_DIR}/${name}`))) {
      markStr = markStr.replace(name, '');
    }
  }
  localStorage.setItem(opfsToolsExpires, markStr.replace(/,{2,}/g, ','));
}

(async function init() {
  // clear tmpfile
  delByInterval();
  await delMarkFiles();
})();

/**
 * Create a temporary file that will automatically be cleared to avoid occupying too much storage space.
 * The temporary file name will be automatically generated and stored in a specific directory.
 */
export function tmpfile() {
  const name = `${Math.random().toString().slice(2)}-${Date.now()}`;
  currentPageTMPFiles.push(name);
  return file(`${TMP_DIR}/${name}`);
}
