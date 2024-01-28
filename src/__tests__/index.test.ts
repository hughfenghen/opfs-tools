import { expect, test } from 'vitest'
import { TextFile, exists } from '..'

test('dir/file exists', async () => {
  expect(await exists('/unit-test/not-exists-dir/')).toBe(false)
  const tf = new TextFile('/unit-test/exists-dir/exists.txt')
  expect(await tf.getSize()).toBe(0)
  expect(await exists('/unit-test/exists-dir/')).toBe(true)
  expect(await exists('/unit-test/exists-dir/exists.txt')).toBe(true)
  await tf.remove()
  expect(await exists('/unit-test/exists-dir/exists.txt')).toBe(false)
})
