import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

export default defineConfig({
  root,
  test: {
    include: ['packages/local-store/test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 10000,
    teardownTimeout: 2000,
  },
})
