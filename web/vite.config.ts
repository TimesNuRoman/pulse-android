import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      $lib: resolve(__dirname, 'src/lib'),
    },
    // Vitest / Vite SSR defaults to `node` conditions. Svelte 5's package
    // exports map returns the SERVER build under `default` and only the
    // CLIENT build under `browser`. Without this, `mount(...)` in
    // @testing-library/svelte fails with `lifecycle_function_unavailable`.
    conditions: ['browser'],
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-codemirror': [
            'codemirror',
            '@codemirror/view',
            '@codemirror/state',
            '@codemirror/lang-markdown',
            '@codemirror/theme-one-dark',
            '@lezer/highlight',
          ],
          'vendor-markdown': ['markdown-it', 'highlight.js'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,svelte}'],
    css: false,
    // Keep tests fast: don't watch by default
    server: {
      deps: {
        inline: ['@testing-library/svelte'],
      },
    },
  },
});
