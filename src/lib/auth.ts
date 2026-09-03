import type { AstroCookies } from 'astro';
import { createServerSupabase } from './supabase';

// The 12 real roles, confirmed by the Phase 0 code audit (Section 2.1 of
// the Project Prompt). Keep this list in sync with that section — it is
// the single source of truth, not this file.
export const ROLES = [
  'super_admin', 'admin', 'proprietor', 'head_teacher', 'principal',
  'teacher', 'subject_teacher', 'bursar', 'student', 'parent',
  'pin_viewer', 'aptitude_guest',
] as const;
export type Role = (typeof ROLES)[number];

export type AuthResult =
  | { status: 'unauthenticated' }
  | { status: 'unauthorized'; role: Role }
  | { status: 'authorized'; role: Role; userId: string };

/**
 * Server-side auth + role check. Call this at the TOP of every protected
 * page's frontmatter, before rendering any real data.
 *
 * FIX: supabase.auth.getUser() must receive the access token explicitly.
 * With persistSession: false there is no stored session, so calling
 * getUser() with no argument always returns null — even when the cookie
 * is present and valid. Passing the token directly validates it against
 * Supabase server-side and returns the real user.
 */
export async function checkAuth(
  cookies: AstroCookies,
  allowedRoles: Role[]
): Promise<AuthResult> {
  const accessToken = cookies.get('sb-access-token')?.value;
  if (!accessToken) return { status: 'unauthenticated' };

  const supabase = createServerSupabase(cookies);

  // THE FIX: pass accessToken explicitly instead of calling getUser()
  // with no argument, which always returns null when persistSession: false
  const { data: { user } } = await supabase.auth.getUser(accessToken);

  if (!user) return { status: 'unauthenticated' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = profile?.role as Role | undefined;
  if (!role) return { status: 'unauthenticated' };

  if (!allowedRoles.includes(role)) {
    return { status: 'unauthorized', role };
  }

  return { status: 'authorized', role, userId: user.id };
}

/**
 * Call this wherever checkAuth returns 'unauthenticated'.
 * Redirects to /login (the real route) and passes the current page
 * as ?next= so the user lands back here after a successful login.
 *
 * FIX 1: was redirecting to /admin/login which does not exist — the real
 *         login page is /login.
 * FIX 2: without ?next= the login page defaulted to '/' after login,
 *         sending admins to the public homepage every time.
 *
 * Usage (in any protected page frontmatter):
 *   if (result.status === 'unauthenticated') return loginRedirect(Astro.url);
 *   if (result.status === 'unauthorized')    return Astro.redirect('/403');
 */
export function loginRedirect(url: URL): Response {
  const next = encodeURIComponent(url.pathname + url.search);
  return new Response(null, {
    status: 302,
    headers: { Location: `/login?next=${next}` },
  });
}
