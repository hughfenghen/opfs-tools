/// <reference types="vitest" />

import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/opfs-tools/',
  build: {
    target: 'ESNext',
    rollupOptions: {
      input: {
        benchmark: resolve(__dirname, 'demo/benchmark.html'),
      },
    },
    outDir: 'demo-dist/',
  },
});
