# opfs-tools

## 0.7.5

### Patch Changes

- 838e66e: refactor(tmpfile): reclaim temporary files via the Web Locks API instead of the deprecated `unload` event

  Each temporary file now holds a per-file Web Lock for the lifetime of the page/worker that created it. Cleanup removes any temp file no longer held by a live session, so files are reclaimed promptly and reliably — even after a crash or a mobile process kill — without relying on the deprecated `unload`/`pagehide` + `localStorage` marking. Falls back to the previous 3-day timestamp rule when Web Locks is unavailable.

## 0.7.4

### Patch Changes

- f2915b0: fix: maybe write file failed

## 0.7.3

### Patch Changes

- 21a1429: feat: force remove dir/file

## 0.7.2

### Patch Changes

- 1bea9e0: refactor: minimizing the impact of breaking changes in version 0.7.0

## 0.7.1

### Patch Changes

- 04baa2f: refactor: rename #8
- a329490: chore: export type OTFile and OTDir

## 0.7.0

### Minor Changes

- 1b0844e: feat: support copy file/dir to FileSystemFileHandle/FileSystemDirectoryHandle, remove return type for 'copyTo' and 'moveTo' [BREAKING]

## 0.6.2

### Patch Changes

- 1186860: refactor: improve error handling in copyTo method

## 0.6.1

### Patch Changes

- cd8aa04: chore: remove debug code

## 0.6.0

### Minor Changes

- 0286d4d: feat: support open mode for file

## 0.5.9

### Patch Changes

- af2bc11: fix: remove dir, should skip using file

## 0.5.7

### Patch Changes

- 3735a5f: feat: add file.getOriginFile
