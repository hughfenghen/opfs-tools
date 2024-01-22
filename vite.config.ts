/// <reference types="vitest" />

// Configure Vitest (https://vitest.dev/config/)

import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      name: 'chrome', // browser name is required
    },

  },
})
