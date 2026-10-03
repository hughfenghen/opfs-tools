---
'opfs-tools': patch
---

refactor(tmpfile): reclaim temporary files via the Web Locks API instead of the deprecated `unload` event

Each temporary file now holds a per-file Web Lock for the lifetime of the page/worker that created it. Cleanup removes any temp file no longer held by a live session, so files are reclaimed promptly and reliably — even after a crash or a mobile process kill — without relying on the deprecated `unload`/`pagehide` + `localStorage` marking. Falls back to the previous 3-day timestamp rule when Web Locks is unavailable.
