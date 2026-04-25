import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      fallback: 'index.html',
      strict: false
    }),
    // Use absolute asset paths so the SPA fallback (served at any deep URL
    // via the Vercel rewrite below) loads its _app/ chunks correctly. With
    // the default relative base, /admin/<secret> would try to load
    // /admin/_app/... and 404.
    paths: { relative: false }
  }
};

export default config;
