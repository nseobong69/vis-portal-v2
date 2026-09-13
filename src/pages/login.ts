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

  // NEW: hand the session back to the browser too, so client-side Supabase
  // calls (React islands using createBrowserSupabase) can be authenticated
  // via supabase.auth.setSession() instead of running anonymously.
  return new Response(
    JSON.stringify({
      ok: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
    }),
    { status: 200 }
  );
};
