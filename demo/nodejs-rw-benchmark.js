import fs from 'fs'

const fileName = './testfile'
if (fs.existsSync(fileName)) fs.unlinkSync(fileName)

const writeData = Array(1000)
  .fill(true)
  .map(() => new Uint8Array(Array(1024 * 100).fill(1)));

console.time('write 100M')
for (const d of writeData) {
  fs.appendFileSync(fileName, d)
}
console.timeEnd('write 100M')


const startPoints = Array(1000)
  .fill(true)
  .map(() => ~~(Math.random() * 1e5));

console.time('read 100k, 1000 times')
const fd = fs.openSync(fileName, 'r');
for (const p of startPoints) {
  fs.readSync(fd, Buffer.alloc(100 * 1024), { offset: p })
}
console.timeEnd('read 100k, 1000 times')

console.time('read all 100M')
fs.readFileSync(fileName)
console.timeEnd('read all 100M')