import { defineConfig } from 'vitest/config'
import path from 'node:path'
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['./test/global-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@payload-config': path.resolve(__dirname, 'src/payload.config.ts'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
