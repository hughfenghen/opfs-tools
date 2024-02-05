import { TextFile } from '../src/text-file';

const tf = new TextFile('/demo/text-file.txt');

// for (const v of Array(9).fill(true).map((_, i) => i + 1)) {
//   await tf.append(Array(v).fill(v).join('') + '\n')
// }

for await (const l of tf.lines()) {
  console.log(44444, l);
}

export {};
