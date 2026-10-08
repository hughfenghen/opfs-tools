import { tmpfile, file, write, dir } from '../src';

console.log(
  'tmpfiles',
  (await dir('/.opfs-tools-temp-dir').children()).map((it) => it.name)
);

const tf = tmpfile();
await write(tf, '111111111');

const filePath = '/unit-test/file';
const f1 = file(filePath);
const f2 = file(filePath);

await write(f1, '111');
await write(f1, '222');

console.log('多文件句柄读写', (await f2.text()) === '222');

export {};
