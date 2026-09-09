import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

/**
 * Server-side Supabase client, built from the request's session cookie.
 * Use this inside .astro page frontmatter / middleware — NEVER trust a
 * role or user id that only lives in client-side JS, since a real MPA
 * route (per Section 3) can be requested directly with no client JS
 * having run at all yet.
 *
 * TODO(Phase 1 real session): wire this to however Supabase Auth's
 * session cookie/JWT is actually stored once you're off the old app's
 * localStorage-based session and onto a server-readable cookie. This
 * stub assumes a `sb-access-token` cookie for illustration.
 */
export function createServerSupabase(cookies: AstroCookies): SupabaseClient {
  const accessToken = cookies.get('sb-access-token')?.value;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Browser-side client for interactive islands (e.g. the attendance-marking form). */
export function createBrowserSupabase(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/**
 * Service-role Supabase client — SERVER-SIDE ONLY, never import this from
 * a component or anything that ships to the browser. Equivalent to what
 * the old app's _callAuthAdmin() edge function does (index.html's Auth
 * Migration tools): create/update Supabase Auth users. The secret lives
 * only in this process's env, same trust boundary as an edge function.
 */
export function createAdminSupabase(): SupabaseClient {
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set — Auth Migration and similar admin actions need it.');
  }
  return createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
