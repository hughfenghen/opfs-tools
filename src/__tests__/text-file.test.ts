import { expect, test } from 'vitest'
import { TextFile } from '../text-file'

test('append string to TextFile', async () => {
  const tf = new TextFile('/unit-test/test.txt', { create: true, overwrite: true });
  await tf.append('Hello world!')
  expect(tf.size).toBe(12)

  const str = '我🩷坤坤'
  const txtEC = new TextEncoder()
  await tf.append(str)
  expect(tf.size).toBe(12 + txtEC.encode(str).byteLength)
})

test('read the text file line by line', async () => {
  const tf = new TextFile('/unit-test/test1.txt', { create: true, overwrite: true });
  await tf.append('Hello world!\n')
  await tf.append('\n')
  await tf.append('我🩷坤坤\n')
  await tf.append('\n')

  const lines = []
  for await (const l of tf.lines()) {
    lines.push(l)
  }
  expect(lines).toEqual(['Hello world!', '', '我🩷坤坤', ''])
})
