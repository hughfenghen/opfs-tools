import { BinaryFile } from '../src'

function getElById(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement
}

const root = await navigator.storage.getDirectory()
const testFileHandle = await root.getFileHandle('testfile', { create: true })
const writer = await testFileHandle.createWritable()

// Write 100KB of data in one operation, repeat it 1000 times, for a total of 100MB.
const writeData = Array(1000).fill(true).map(() => new Uint8Array(Array(1024 * 100).fill(1)))

let startTime = performance.now()
for (const d of writeData) {
  await writer.write(d)
}

getElById('built-in-writer-cost').textContent = `${~~(performance.now() - startTime)}ms`

await writer.truncate(0)
await writer.close()

let bf = new BinaryFile('testfile')
startTime = performance.now()
for (const d of writeData) {
  await bf.append(d)
}

await bf.close()
getElById('opfs-tools-writer-cost').textContent = `${~~(performance.now() - startTime)}ms`

const startPoints = Array(10000)
  .fill(true)
  .map(() => ~~(Math.random() * 1e5))

const file = await testFileHandle.getFile()
startTime = performance.now()
for (const p of startPoints) {
  await file.slice(p, p + 100 * 1024).arrayBuffer()
}
getElById('file-slice-read-cost').textContent = `${~~(performance.now() - startTime)}ms`

bf = new BinaryFile('testfile')
startTime = performance.now()
for (const p of startPoints) {
  await bf.read(p, 100 * 1024)
}
getElById('opfs-tools-read-cost').textContent = `${~~(performance.now() - startTime)}ms`


getElById('status').remove()

export default {}
