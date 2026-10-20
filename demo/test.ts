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

{
  const f = tmpfile();
  await using writer = await f.createWriter();
  console.log('using writer, auto invoke close', writer);
}

// await file('/unit-test/multi-tab-open-file').createWriter();
const multiTabFile = file('/unit-test/multi-tab-open-file', {
  mode: 'rw-unsafe',
})
// 同一文件两种模式互斥：multiTabFile 存活期间，以另一模式打开同 path 会在创建点抛错。
try {
  file('/unit-test/multi-tab-open-file'); // 默认 rw，与存活的 rw-unsafe 冲突
} catch (err) {
  console.log('expected mutual-exclusion error:', (err as Error).message);
}
const writer = await multiTabFile.createWriter();
await writer.truncate(0)
// 打开两个tab，观察同一个文件，在两个 tab 以 unsafe 模式同时写入
// setInterval(async () => {
//   await writer.write('1')
//   console.log('file content:', await multiTabFile.text())
// }, 1000)

export {};
