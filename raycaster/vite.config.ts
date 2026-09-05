import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  // Inline PostCSS config stops Vite from picking up the parent Next.js project's postcss.config.mjs.
  css: { postcss: {} },
  build: {
    target: 'es2022',
    sourcemap: true,
    outDir: 'dist',
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
