/// <reference types="vitest" />

import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/opfs-tools/',
  build: {
    target: 'ESNext',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'benchmark/index.html'),
      },
    },
    outDir: 'benchmark-dist/',
  },
});
