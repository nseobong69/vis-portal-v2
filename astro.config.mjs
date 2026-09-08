import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

// output: 'server' is REQUIRED, not optional — this is what makes every
// route in src/pages/ a real server-rendered route (Section 3's hard
// requirement) instead of a static-only build that can't do the
// server-side auth check also required by Section 3. Do not switch this
// to 'static' or 'hybrid' for any authenticated route.
//
// vite.build.cssCodeSplit: false — WITHOUT this, Astro splits each
// route's CSS into its own chunk and, in `server` output mode, does not
// reliably emit a <link> tag for that chunk on first load (this is the
// bug behind "page loads with zero styling" — e.g. admin/dashboard.astro
// rendering as unstyled default HTML even though the Tailwind classes
// are correct). Disabling code-splitting bundles ALL page CSS into one
// file that's guaranteed to be linked on every route, at the cost of a
// slightly larger single CSS payload — an acceptable tradeoff for an
// app this size. Do not remove this line without re-verifying every
// route still renders styled, not just the ones you happened to test.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react(), tailwind()],
  vite: {
    build: {
      cssCodeSplit: false,
    },
  },
});
