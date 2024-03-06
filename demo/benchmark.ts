import { openDB } from 'idb';
import { file } from '../src';

const db = await openDB('my-db', 1, {
  upgrade(db) {
    db.createObjectStore('data');
  },
});

function getElById(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

const fileName = 'testfile';
const root = await navigator.storage.getDirectory();

// Write 100KB of data in one operation, repeat it 1000 times, for a total of 100MB.
const writeData = Array(1000)
  .fill(true)
  .map(() => new Uint8Array(Array(1024 * 100).fill(1)));

let startTime = performance.now();
let testFileHandle = await root.getFileHandle(fileName, { create: true });
const writer1 = await testFileHandle.createWritable();
for (const d of writeData) {
  await writer1.write(d);
}
updateCost('built-in-writer-cost');

startTime = performance.now();
let tx = db.transaction('data', 'readwrite');
let store = tx.objectStore('data');
let i = 0;
for (const d of writeData) {
  store.put(d, `testfile${i++}`);
}
await tx.done;
updateCost('indexeddb-write-cost');

await writer1.truncate(0);
await writer1.close();

startTime = performance.now();
const writer2 = await file(fileName).createWriter();
for (const d of writeData) {
  await writer2.write(d);
}
await writer2.close();
updateCost('opfs-tools-writer-cost');

// ------------------------------------------------

const startPoints = Array(1000)
  .fill(true)
  .map(() => ~~(Math.random() * 1e5));

startTime = performance.now();
testFileHandle = await root.getFileHandle(fileName, { create: true });
const f1 = await testFileHandle.getFile();
for (const p of startPoints) {
  await f1.slice(p, p + 100 * 1024).arrayBuffer();
}
updateCost('file-slice-read-cost');

const idbKeys = Array(1000)
  .fill(0)
  .map((_, idx) => `testfile${idx}`);

startTime = performance.now();
tx = db.transaction('data', 'readwrite');
store = tx.objectStore('data');
i = 0;
for (const k of idbKeys) {
  await store.get(k);
}
await tx.done;
updateCost('indexeddb-read-cost');

startTime = performance.now();
const reader = await file(fileName).createReader();
for (const p of startPoints) {
  await reader.read(100 * 1024, { at: p });
}
await reader.close();
updateCost('opfs-tools-read-cost');

// ------------------------------------------------

startTime = performance.now();
testFileHandle = await root.getFileHandle(fileName, { create: true });
await (await testFileHandle.getFile()).arrayBuffer();
updateCost('file-slice-read-all-cost');

startTime = performance.now();
await file(fileName).arrayBuffer();
updateCost('opfs-tools-read-all-cost');

getElById('status').remove();

function updateCost(id: string) {
  getElById(id).textContent = `${~~(performance.now() - startTime)}ms`;
}

export default {};
