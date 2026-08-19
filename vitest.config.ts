import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts', 'packages/**/*.spec.ts', 'packages/**/*.spec.tsx', 'apps/**/*.spec.ts'],
    testTimeout: 10_000,
  },
})
