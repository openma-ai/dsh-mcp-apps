import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { app: 'app.ts' },
  outDir: 'dist',
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  clean: true,
  minify: true,
  dts: false,
  deps: {
    alwaysBundle: () => true,
  },
  outputOptions: {
    entryFileNames: 'app.js',
  },
})
