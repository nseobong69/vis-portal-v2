import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

// Ports confirmProfileEmailOTP(). On match, marks the OTP row confirmed
// — the actual email update on the `students` row happens in
// update.ts, which only accepts an email change when a confirmed,
// unexpired OTP row exists for that exact (student, email) pair. This
// two-step split (confirm the code here, apply the change there) is so
// a confirmed-but-not-yet-saved verification can't be replayed against
// a different email later.
export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ['student']);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  let body: { email?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }
  const email = (body.email || '').trim().toLowerCase();
  const code = (body.code || '').trim();
  if (!email || !code) {
    return new Response(JSON.stringify({ error: 'Enter the 6-digit code sent to your email.' }), { status: 400 });
  }

  const supabase = createServerSupabase(cookies);
  const { data: otpRow } = await supabase
    .from('profile_email_otps')
    .select('id, code, expires_at, confirmed')
    .eq('user_type', 'student')
    .eq('user_id', auth.userId)
    .eq('email', email)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!otpRow) {
    return new Response(JSON.stringify({ error: 'No verification code found for this email. Click Verify again.' }), { status: 404 });
  }
  if (new Date(otpRow.expires_at) < new Date()) {
    return new Response(JSON.stringify({ error: 'This code has expired. Click Verify to get a new one.' }), { status: 410 });
  }
  if (otpRow.code !== code) {
    return new Response(JSON.stringify({ error: 'Incorrect code.' }), { status: 401 });
  }

  const { error } = await supabase.from('profile_email_otps').update({ confirmed: true }).eq('id', otpRow.id);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
