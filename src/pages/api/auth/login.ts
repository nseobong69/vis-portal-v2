import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const POST: APIRoute = async ({ request, cookies }) => {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }
  const { email, password } = body;
  if (!email || !password) {
    return new Response(JSON.stringify({ error: 'Email and password are required.' }), { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Only student accounts use an uppercased password — that's the old
  // app's own rule (studentLogin() does .toUpperCase(), staffLogin()
  // and parentLogin() do not; index.html ~L6015, ~L6021, ~L6104,
  // ~L6111). Detect a student login the same way the rest of this app
  // already does: the synthetic email always ends in
  // "@student.vis.school". Staff/parent emails never do, so their
  // password is passed through exactly as typed, same as before.
  const isStudent = email.toLowerCase().endsWith('@student.vis.school');
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: isStudent ? password.toUpperCase() : password,
  });

  if (error || !data.session) {
    return new Response(JSON.stringify({ error: error?.message || 'Invalid email or password.' }), { status: 401 });
  }

  cookies.set('sb-access-token', data.session.access_token, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: data.session.expires_in,
  });

  // FIX: this response never included `role` at all — login.astro's
  // role-based redirect (`json.role && DEFAULT_BY_ROLE[json.role]`) was
  // therefore always falling through to FALLBACK_DEFAULT
  // ('/admin/dashboard') for EVERY login, students included, no matter
  // what checkAuth() would correctly resolve them to on the next page.
  // That's why a student login "succeeded" but still landed on a 403 —
  // the redirect itself was blind to the role the whole time.
  //
  // Same lookup order as checkAuth() (src/lib/auth.ts): profiles by
  // auth_id first, then students by auth_id. Deliberately NOT doing the
  // email-fallback+backfill here — that's checkAuth's job on the very
  // next request, and duplicating it here would just be two places that
  // can drift out of sync.
  const user = data.user;
  let role: string | null = null;

  const { data: profile } = await supabase.from('profiles').select('role, roles').eq('auth_id', user.id).maybeSingle();
  if (profile) {
    const allRoles: string[] = (profile.roles && profile.roles.length > 0) ? profile.roles : [profile.role || 'admin'];
    const priority = ['super_admin', 'admin', 'proprietor', 'principal', 'head_teacher', 'teacher', 'bursar', 'subject_teacher'];
    role = priority.find((r) => allRoles.includes(r)) || allRoles[0] || null;
  } else {
    const { data: student } = await supabase.from('students').select('id').eq('auth_id', user.id).maybeSingle();
    if (student) role = 'student';
    else if (isStudent) role = 'student'; // auth_id not backfilled yet — checkAuth will do it next request, but we already know from the email shape
  }

  return new Response(
    JSON.stringify({
      ok: true,
      role,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
    }),
    { status: 200 }
  );
};
