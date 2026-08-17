import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/**/*.spec.ts', 'packages/**/*.spec.tsx', 'apps/**/*.spec.ts'],
    testTimeout: 10_000,
  },
})
