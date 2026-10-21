/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// A relative base lets the built app be served from any path (the container
// serves it next to /workspace/; a reviewer may open it from a sub-folder).
export default defineConfig({
  base: './',
  // the study build serves the study rounds (npm run study:data) instead of the example;
  // VITE_PUBLIC_DIR serves another folder (the demo video: the normal tool on round C1)
  publicDir:
    process.env.VITE_PUBLIC_DIR ?? (process.env.VITE_STUDY === '1' ? 'study-public' : 'public'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // the repository's docs/ (the REAL-DSL manual is shown in the tool)
      '@docs': fileURLToPath(new URL('../docs', import.meta.url)),
    },
  },
  // the authoring helper (python -m scripts.redsl.serve): the parser that gates
  // a new requirement, and the lists its form offers
  server: {
    proxy: { '/authoring': 'http://127.0.0.1:8765' },
    fs: { allow: ['.', '../docs/manual'] },
  },
  preview: { proxy: { '/authoring': 'http://127.0.0.1:8765' } },
  build: {
    target: 'es2022',
    sourcemap: true,
    // the study build also ships the researchers' sessions page (admin.html)
    rollupOptions: {
      input:
        process.env.VITE_STUDY === '1'
          ? { main: 'index.html', admin: 'admin.html' }
          : { main: 'index.html' },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    css: false,
    testTimeout: 30_000,
  },
});
