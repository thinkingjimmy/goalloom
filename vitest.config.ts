import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root,
  test: {
    include: [
      'apps/desktop/tests/**/*.test.ts',
      'packages/crypto/test/**/*.test.ts',
      'packages/tests/**/*.test.ts',
    ],
    environment: 'node',
    setupFiles: ['apps/desktop/tests/setup-temporal.ts'],
  },
})
