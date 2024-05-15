import { dir } from './directory';
import { OPFSFileWrap, file } from './file';

const TMP_DIR = '/.opfs-tools-temp-dir';

async function safeRemove(f: OPFSFileWrap) {
  try {
    const writer = await f.createWriter();
    await writer.truncate(0);
    await writer.close();
    await f.remove();
  } catch (e) {
    console.error(e);
  }
}

// 'export' is for ease of testing
export function delByInterval() {
  setInterval(async () => {
    for (const f of await dir(TMP_DIR).children()) {
      if (f.kind !== 'file') continue;
      const match = /^\d+-(\d+)$/.exec(f.name);
      if (match == null) {
        await f.remove();
      } else if (Date.now() - Number(match[1]) > 1000 * 60 * 60 * 24 * 3) {
        // Delete files that are older than three days and are not in writing
        await safeRemove(f);
      }
    }
    return Promise.resolve();
  }, 60 * 1000);
}

const currentPageTMPFiles: string[] = [];
let bindedUnloadEvt = false;
// 'export' is for ease of testing
export async function delMarkFiles() {
  const opfsToolsExpires = 'OPFS_TOOLS_EXPIRES_TMP_FILES';

  if (!bindedUnloadEvt) {
    bindedUnloadEvt = true;
    window.addEventListener('unload', () => {
      if (currentPageTMPFiles.length === 0) return;
      localStorage.setItem(
        opfsToolsExpires,
        `${
          localStorage.getItem(opfsToolsExpires) ?? ''
        },${currentPageTMPFiles.join(',')}`
      );
    });
  }

  for (const name of (localStorage.getItem(opfsToolsExpires) ?? '').split(
    ','
  )) {
    if (name.length === 0) continue;
    await safeRemove(file(`${TMP_DIR}/${name}`));
  }
  localStorage.setItem(opfsToolsExpires, '');
}

(async function init() {
  // clear tmpfile
  delByInterval();
  await delMarkFiles();
})();

/**
 * Create a temporary file that will automatically be cleared to avoid occupying too much storage space. The temporary file name will be automatically generated and stored in a specific directory.
 */
export function tmpfile() {
  const name = `${Math.random().toString().slice(2)}-${Date.now()}`;
  currentPageTMPFiles.push(name);
  return file(`${TMP_DIR}/${name}`);
}
