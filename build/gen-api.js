import { $ } from 'zx';

; (async () => {
  const [tplStr, fileDTS, dirDTS, tmpfileDTS] = (await Promise.all([
    $`cat ./docs/_api_tpl`,
    $`cat ./dist/file.d.ts`,
    $`cat ./dist/directory.d.ts`,
    $`cat ./dist/tmpfile.d.ts`,
  ])).map(it => it.stdout.trim())

  const apiStr = tplStr.replace('<file-api>', fileDTS)
    .replace('<dir-api>', dirDTS)
    .replace(
      '<tmpfile>',
      tmpfileDTS.replace(/export.+delByInterval.+\n/, '')
        .replace(/export.+delMarkFiles.+\n/, '')
    )
    .replace('export {};\n', '')

  await $`echo ${apiStr} > ./docs/api.md`
})();