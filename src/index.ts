
export { TextFile } from './text-file'
export { BinaryFile } from './binary-file'

const root = await navigator.storage.getDirectory()
export async function exists(filePath: string) {
  if (!filePath.startsWith('/')) throw Error('The path must begin with the "/" character')

  const paths = filePath.split('/')
  const dirNames = paths.slice(1, -1)
  const fileName = paths.at(-1) as string
  let dirHandle
  try {
    for (const p of dirNames) {
      dirHandle = await root.getDirectoryHandle(p, { create: false })
    }
    if (fileName !== '') await dirHandle?.getFileHandle(fileName, { create: false })
  } catch (err) {
    if ((err as Error).name === 'NotFoundError') return false
    throw err
  }
  return true
}