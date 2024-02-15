import { file } from '../src';

function getElById(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

const root = await navigator.storage.getDirectory();
const testFileHandle = await root.getFileHandle('testfile', { create: true });

// Write 100KB of data in one operation, repeat it 1000 times, for a total of 100MB.
const writeData = Array(1000)
  .fill(true)
  .map(() => new Uint8Array(Array(1024 * 100).fill(1)));

let startTime = performance.now();
const writer1 = await testFileHandle.createWritable();
for (const d of writeData) {
  await writer1.write(d);
}

getElById('built-in-writer-cost').textContent = `${~~(
  performance.now() - startTime
)}ms`;

await writer1.truncate(0);
await writer1.close();

const writer2 = await file('testfile').createWriter();
startTime = performance.now();
for (const d of writeData) {
  await writer2.write(d);
}
await writer2.close();
getElById('opfs-tools-writer-cost').textContent = `${~~(
  performance.now() - startTime
)}ms`;

const startPoints = Array(10000)
  .fill(true)
  .map(() => ~~(Math.random() * 1e5));

const f1 = await testFileHandle.getFile();
startTime = performance.now();
for (const p of startPoints) {
  await f1.slice(p, p + 100 * 1024).arrayBuffer();
}
getElById('file-slice-read-cost').textContent = `${~~(
  performance.now() - startTime
)}ms`;

const reader = await file('test-file').createReader();
startTime = performance.now();
for (const p of startPoints) {
  await reader.read(100 * 1024, { at: p });
}
getElById('opfs-tools-read-cost').textContent = `${~~(
  performance.now() - startTime
)}ms`;

getElById('status').remove();

export default {};
