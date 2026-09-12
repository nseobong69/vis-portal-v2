import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE-ROLE CLIENT — server-only. Never import this file from a .tsx
// component or anything that ships to the browser.
//
// The old app's own comment on this (index.html ~L18488, _renderSvcKeyBanner):
// "Service role key lives in Supabase Vault — no key entry needed in the
// browser... Auth operations run securely via server function." It called
// a Supabase Edge Function (create-auth-user) to keep the service-role key
// out of client JS entirely. This file is the Astro-native equivalent —
// an API route (signup-profiles/action.ts) imports this, the browser never
// sees the key, same security property the old app already had.
//
// SETUP REQUIRED: add SUPABASE_SERVICE_ROLE_KEY to your environment (Render
// → Environment, or .env locally) — the actual service_role key from
// Supabase → Project Settings → API. Do NOT prefix it with PUBLIC_ (Astro
// only ships PUBLIC_-prefixed vars to the browser bundle; leaving this one
// unprefixed is what keeps it server-only).
// ═══════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

export function createAdminSupabase(): SupabaseClient {
  if (!SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Add it in your environment (server-only, no PUBLIC_ prefix) to enable account creation.'
    );
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
