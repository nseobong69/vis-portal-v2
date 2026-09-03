import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

// output: 'server' is REQUIRED, not optional — this is what makes every
// route in src/pages/ a real server-rendered route (Section 3's hard
// requirement) instead of a static-only build that can't do the
// server-side auth check also required by Section 3. Do not switch this
// to 'static' or 'hybrid' for any authenticated route.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react(), tailwind()],
  vite: {
    build: {
      // FIX: Astro/Vite's default per-page CSS code-splitting was linking
      // pages to the WRONG chunk (e.g. /admin/dashboard was served
      // "403.[hash].css" and "academics.[hash].css" instead of its own
      // styles), leaving every Tailwind class in the markup with no
      // matching CSS. Disabling cssCodeSplit bundles all Tailwind output
      // into a single shared stylesheet linked on every page, so no page
      // can end up pointing at another page's (or no) CSS chunk.
      cssCodeSplit: false,
    },
  },
});
