import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

// Ports sendProfileEmailOTP(). The old app sent the OTP client-side via
// EmailJS after checking SCHOOL_SETTINGS.emailjs_* config and checking
// for an existing profiles/students row with that email. This does the
// same two checks server-side, then stores the OTP in a new
// `profile_email_otps` table (student_id, email, code, confirmed,
// expires_at — not in the original schema, needs a migration; see
// README) instead of only holding it in a client-side EmailJS send.
// Actually emailing the code still needs EMAILJS_SERVICE_ID /
// EMAILJS_TEMPLATE_ID / EMAILJS_PRIVATE_KEY set server-side — same
// "needs real credentials once deployed" situation as Paystack in
// Phase 3b. Without them this generates and stores a real code but
// can't deliver it; that failure is reported back rather than silently
// pretending to have sent an email.
function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ['student']);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }
  const email = (body.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ error: 'Enter a valid email address first.' }), { status: 400 });
  }

  const supabase = createServerSupabase(cookies);

  // Same duplicate-email guard as the old app (profiles + students,
  // excluding the current user).
  const [{ data: profMatch }, { data: stuMatch }] = await Promise.all([
    supabase.from('profiles').select('id').eq('email', email).neq('id', auth.userId).limit(1),
    supabase.from('students').select('id').eq('email', email).neq('id', auth.userId).limit(1),
  ]);
  if (profMatch?.length || stuMatch?.length) {
    return new Response(JSON.stringify({ error: 'This email is already in use by another account.' }), { status: 409 });
  }

  const code = generateOtp();
  const expires_at = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(); // 6 hours, matches old app copy

  const { error: insertError } = await supabase.from('profile_email_otps').insert({
    user_type: 'student',
    user_id: auth.userId,
    email,
    code,
    confirmed: false,
    expires_at,
  });
  if (insertError) {
    return new Response(JSON.stringify({ error: insertError.message }), { status: 500 });
  }

  const emailjsConfigured =
    !!import.meta.env.EMAILJS_SERVICE_ID && !!import.meta.env.EMAILJS_TEMPLATE_ID && !!import.meta.env.EMAILJS_PRIVATE_KEY;

  if (!emailjsConfigured) {
    return new Response(
      JSON.stringify({
        error: 'Email delivery is not configured yet (EMAILJS_SERVICE_ID/TEMPLATE_ID/PRIVATE_KEY). The code was generated but could not be sent — see the Phase output doc.',
      }),
      { status: 502 }
    );
  }

  try {
    await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: import.meta.env.EMAILJS_SERVICE_ID,
        template_id: import.meta.env.EMAILJS_TEMPLATE_ID,
        user_id: import.meta.env.EMAILJS_PUBLIC_KEY,
        accessToken: import.meta.env.EMAILJS_PRIVATE_KEY,
        template_params: { to_email: email, otp_code: code },
      }),
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Could not send the verification email. Try again.' }), { status: 502 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
