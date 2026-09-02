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
 * page's frontmatter, before rendering any real data — per Section 3:
 * "This check must happen server-side on every request to that route,
 * not only in client-side JS after the page has already loaded."
 *
 * TODO(Phase 1 real session): replace the `profiles` table lookup below
 * with however the old app actually resolves ROLE from the session
 * (check index.html's ROLE-assignment logic near the `defineProperty`
 * tamper-proofing mentioned in its CSP comment) — this stub assumes a
 * `profiles.role` column keyed by auth user id, which matches the
 * Phase 0 audit's table list but wasn't verified line-by-line.
 */
export async function checkAuth(
  cookies: AstroCookies,
  allowedRoles: Role[]
): Promise<AuthResult> {
  const supabase = createServerSupabase(cookies);
  const { data: { user } } = await supabase.auth.getUser();

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
