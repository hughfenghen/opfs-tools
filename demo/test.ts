import { tmpfile, file, write } from '../src';

console.log(111, localStorage.getItem('OPFS_TOOLS_EXPIRES_TMP_FILES'));
const f = tmpfile();
console.log(222, f.path);
await write(f, '111111111');

await write('/.opfs-tools-temp-dir/xxx', '2222');

const filePath = '/unit-test/file';
const f1 = file(filePath, 'rw-unsafe');
const f2 = file(filePath, 'rw-unsafe');

await write(f1, '111');
await write(f1, '222');

console.log('多文件句柄读写', (await f2.text()) === '222');

export {};
