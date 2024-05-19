import { tmpfile, write } from '../src';

console.log(111, localStorage.getItem('OPFS_TOOLS_EXPIRES_TMP_FILES'));
const f = tmpfile();
console.log(222, f.path);
await write(f, '111111111');

await write('/.opfs-tools-temp-dir/xxx', '2222');

export {};
