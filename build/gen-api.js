import { $ } from 'zx';

; (async () => {
  const [tplStr, fileDTS, dirDTS] = (await Promise.all([
    $`cat ./docs/_api_tpl`,
    $`cat ./dist/file.d.ts`,
    $`cat ./dist/directory.d.ts`,
  ])).map(it => it.stdout.trim())

  const apiStr = tplStr.replace('<file-api>', fileDTS).replace('<dir-api>', dirDTS).replace('export {};\n', '')

  await $`echo ${apiStr} > ./docs/api.md`
})();