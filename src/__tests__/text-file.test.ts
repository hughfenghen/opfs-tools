import { expect, test } from 'vitest'
import { TextFile } from '../text-file'

test('append string to TextFile', async () => {
  const tf = new TextFile('/unit-test/test1.txt', {
    overwrite: true
  })
  await tf.append('Hello world!')
  expect(await tf.getSize()).toBe(12)

  const str = '我🩷坤坤'
  const txtEC = new TextEncoder()
  await tf.append(str)
  expect(await tf.getSize()).toBe(12 + txtEC.encode(str).byteLength)
  await tf.remove()
})

test('read the text file line by line', async () => {
  const tf = new TextFile('/unit-test/test2.txt', {
    overwrite: true
  })
  await tf.append('Hello world!\n')
  await tf.append('\n')
  await tf.append('我🩷坤坤\n')
  await tf.append('\n')

  const lines = []
  for await (const l of tf.lines()) {
    lines.push(l)
  }
  expect(lines).toEqual(['Hello world!', '', '我🩷坤坤', ''])
  await tf.remove()
})

test('read text file as a string', async () => {
  const tf = new TextFile('/unit-test/test3.txt', {
    overwrite: true
  })
  await tf.append('Hello world!\n')
  await tf.append('\n')
  await tf.append('我🩷坤坤\n')
  await tf.append('\n')

  expect((await tf.text())).toBe('Hello world!\n\n我🩷坤坤\n\n')
  await tf.remove()
})

test('empty file', async () => {
  const tf = new TextFile('/unit-test/test4.txt', {
    overwrite: true
  })
  await tf.append('Hello world!')
  expect(await tf.getSize()).toBe(12)

  await tf.truncate(0)
  expect(await tf.getSize()).toBe(0)
  await tf.remove()
})