import { expect, test } from 'vitest';
import { parsePath } from '../common';

test('parse path', async () => {
  expect(parsePath('a')).toEqual({
    parent: '/',
    name: 'a',
  });

  expect(parsePath('/a/b/c')).toEqual({
    parent: '/a/b',
    name: 'c',
  });

  expect(parsePath('/a/b/c/')).toEqual({
    parent: '/a/b',
    name: 'c',
  });
});
