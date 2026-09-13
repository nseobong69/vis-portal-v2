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
 * FIX 1 (unchanged from before): supabase.auth.getUser() must receive
 * the access token explicitly. With persistSession: false there is no
 * stored session, so calling getUser() with no argument always returns
 * null — even when the cookie is present and valid.
 *
 * FIX 2 (this pass): the previous version looked up the profile with
 * `.from('profiles').select('role').eq('id', user.id)` — silently
 * assuming profiles.id IS the Supabase Auth user id. That's only true
 * for accounts created a specific way (apparently true for the one
 * Super Admin account that was working). The old app's own
 * staffLogin()/studentLogin() (index.html ~6012-6080) prove the real
 * schema: profiles/students each have their OWN id, linked to auth via
 * a SEPARATE auth_id column, resolved with an email/admission_number
 * fallback that also backfills auth_id on first successful match. Any
 * account where id !== auth_id (almost every pre-existing account)
 * silently failed this check and got treated as unauthenticated, even
 * though Supabase Auth itself had just accepted their password. This
 * is why only one account worked.
 *
 * FIX 3 (this pass): the previous version only ever queried `profiles`.
 * Students live in a SEPARATE `students` table entirely — there was no
 * code path here that could ever recognize a student session as valid,
 * structurally, not as an occasional bug. Now falls back to `students`
 * when no profile matches.
 */
export async function checkAuth(
  cookies: AstroCookies,
  allowedRoles: Role[]
): Promise<AuthResult> {
  const accessToken = cookies.get('sb-access-token')?.value;
  if (!accessToken) return { status: 'unauthenticated' };

  const supabase = createServerSupabase(cookies);

  // THE FIX: pass accessToken explicitly instead of calling getUser()
  // with no argument, which always returns null when persistSession: false.
  const { data: { user } } = await supabase.auth.getUser(accessToken);
  if (!user) return { status: 'unauthenticated' };

  // ── Try staff/admin first: profiles.auth_id, same lookup order as
  // staffLogin() (auth_id, then email fallback + backfill). ──
  let role: Role | undefined;
  const { data: p1 } = await supabase.from('profiles').select('id, role, roles').eq('auth_id', user.id).maybeSingle();
  let profile = p1;

  if (!profile && user.email) {
    const { data: p2 } = await supabase.from('profiles').select('id, role, roles').eq('email', user.email).maybeSingle();
    if (p2) {
      await supabase.from('profiles').update({ auth_id: user.id }).eq('id', p2.id);
      profile = p2;
    }
  }

  if (profile) {
    // Same highest-privilege-role selection as staffLogin() (index.html
    // line 6041-6042), for accounts holding multiple roles.
    const allRoles: string[] = (profile.roles && profile.roles.length > 0) ? profile.roles : [profile.role || 'admin'];
    const priority: Role[] = ['super_admin', 'admin', 'proprietor', 'principal', 'head_teacher', 'teacher', 'bursar', 'subject_teacher'];
    role = priority.find((r) => allRoles.includes(r)) || (allRoles[0] as Role);
  } else {
    // ── Not staff — try students, same lookup order as studentLogin()
    // (auth_id, then admission_number fallback via email match isn't
    // applicable here since students authenticate via synthetic email;
    // match by the synthetic email's local part instead). ──
    const { data: s1 } = await supabase.from('students').select('id, blocked').eq('auth_id', user.id).maybeSingle();
    let student = s1;

    if (!student && user.email?.endsWith('@student.vis.school')) {
      const admFromEmail = user.email.split('@')[0];
      const { data: allStudents } = await supabase.from('students').select('id, admission_number, blocked');
      const match = (allStudents || []).find(
        (s) => (s.admission_number || '').replace(/[/\\\s]/g, '').toLowerCase() === admFromEmail
      );
      if (match) {
        await supabase.from('students').update({ auth_id: user.id, has_account: true }).eq('id', match.id);
        student = { id: match.id, blocked: match.blocked };
      }
    }

    if (student) {
      if (student.blocked) return { status: 'unauthenticated' }; // same as old app's forced sign-out on blocked
      role = 'student';
    }
  }

  if (!role) return { status: 'unauthenticated' };
  if (!allowedRoles.includes(role)) return { status: 'unauthorized', role };
  return { status: 'authorized', role, userId: user.id };
}

/**
 * Call this wherever checkAuth returns 'unauthenticated'. Redirects to
 * /login (the real route) and passes the current page as ?next= so the
 * user lands back here after a successful login.
 */
export function loginRedirect(url: URL): Response {
  const next = encodeURIComponent(url.pathname + url.search);
  return new Response(null, {
    status: 302,
    headers: { Location: `/login?next=${next}` },
  });
}
