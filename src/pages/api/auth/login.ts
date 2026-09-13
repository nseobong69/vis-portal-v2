import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

// Same highest-privilege-role priority as checkAuth.ts/staffLogin()
// (index.html ~L6041-6042).
const ROLE_PRIORITY = ['super_admin', 'admin', 'proprietor', 'principal', 'head_teacher', 'teacher', 'bursar', 'subject_teacher'];

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

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
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

  // NEW: resolve role right here at login time — same auth_id → email
  // fallback (profiles), then students, lookup order as checkAuth.ts —
  // so login.astro knows which dashboard to send the person to instead
  // of hardcoding /admin/dashboard for everyone regardless of role.
  const user = data.session.user;
  let role: string | null = null;

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
    const allRoles: string[] = profile.roles && profile.roles.length > 0 ? profile.roles : [profile.role || 'admin'];
    role = ROLE_PRIORITY.find((r) => allRoles.includes(r)) || allRoles[0] || null;
  } else {
    const { data: s1 } = await supabase.from('students').select('id, auth_id').eq('auth_id', user.id).maybeSingle();
    let student = s1;
    if (!student && user.email?.endsWith('@student.vis.school')) {
      const admFromEmail = user.email.split('@')[0];
      const { data: allStudents } = await supabase.from('students').select('id, admission_number');
      const match = (allStudents || []).find(
        (s) => (s.admission_number || '').replace(/[/\\\s]/g, '').toLowerCase() === admFromEmail
      );
      if (match) {
        await supabase.from('students').update({ auth_id: user.id, has_account: true }).eq('id', match.id);
        student = { id: match.id, auth_id: user.id };
      }
    }
    if (student) role = 'student';
    else {
      // Not staff, not student — check parents the same way (parents
      // authenticate with a real email, same as staff, so auth_id then
      // email fallback is enough — no synthetic-email case needed here).
      const { data: par1 } = await supabase.from('parents').select('id, auth_id').eq('auth_id', user.id).maybeSingle();
      let parent = par1;
      if (!parent && user.email) {
        const { data: par2 } = await supabase.from('parents').select('id').eq('email', user.email).maybeSingle();
        if (par2) {
          await supabase.from('parents').update({ auth_id: user.id }).eq('id', par2.id);
          parent = { id: par2.id, auth_id: user.id };
        }
      }
      if (parent) role = 'parent';
    }
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
