import { OPFSFileWrap } from "./opfs-file-wrap";

// 100M 文件，1w 次读取 100k
// read 相对 slice 快 3 倍
const root = await navigator.storage.getDirectory();
const testFileHandle = await root.getFileHandle('testfile', { create: true });
const writer = await testFileHandle.createWritable()

// 100M
for (const _ of Array(100).fill(true)) {
  await writer.write(new Uint8Array(Array(1024 * 1204).fill(1).map(() => ~~(Math.random() * 10))))
}

await writer.close()

const file = await testFileHandle.getFile()

const startPoints = Array(10000).fill(1).map(() => ~~(Math.random() * 1e5))

console.log(4444, file.size, startPoints)

const opfsWrap = new OPFSFileWrap('testfile')

console.time('slice cost')
for (const p of startPoints) {
  // 一次读取 100 kb
  await file.slice(p, p + 100 * 1024).arrayBuffer()
}
console.timeEnd('slice cost')

console.time('opfs cost')
for (const p of startPoints) {
  // 一次读取 100 kb
  await opfsWrap.read(p, 100 * 1024)
}
console.timeEnd('opfs cost')

export default {}
