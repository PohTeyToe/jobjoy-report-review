import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  resolve: {
    // jsdom is a browser-like env — load Svelte's browser build, not the SSR
    // build (which throws "mount is not available on the server").
    conditions: ['browser']
  },
  test: {
    include: ['tests/unit/**/*.{test,spec}.{js,ts}'],
    environment: 'jsdom',
    setupFiles: ['./tests/unit/setup.ts']
  }
});
