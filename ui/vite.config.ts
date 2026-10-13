/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// A relative base lets the built app be served from any path (the container
// serves it next to /workspace/; a reviewer may open it from a sub-folder).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // the authoring helper (python -m scripts.redsl.serve): the parser that gates
  // a new requirement, and the lists its form offers
  server: { proxy: { '/authoring': 'http://127.0.0.1:8765' } },
  preview: { proxy: { '/authoring': 'http://127.0.0.1:8765' } },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    css: false,
    testTimeout: 30_000,
  },
});
