import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

// Ports the core update half of saveProfile() for the student role.
// Password goes to Supabase Auth only, never the `students` table, same
// rule as the Parent Portal's saveParentProfile port. Email is now
// gated the way the old app gated it: a change is only applied if a
// confirmed, unexpired OTP row exists for that exact (student, email)
// pair (see verify-otp.ts) — otherwise the email field is silently kept
// at its current value and the redirect flags it, rather than either
// applying an unverified email or blocking the rest of the form.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const auth = await checkAuth(cookies, ['student']);
  if (auth.status !== 'authorized') {
    return redirect('/login');
  }

  const form = await request.formData();
  const full_name = String(form.get('full_name') || '').trim();
  const gender = String(form.get('gender') || '');
  const submittedEmail = String(form.get('email') || '').trim().toLowerCase();
  const phone = String(form.get('phone') || '').trim();
  const address = String(form.get('address') || '').trim();
  const newPassword = String(form.get('password') || '').trim();

  const supabase = createServerSupabase(cookies);

  const { data: current } = await supabase.from('students').select('email').eq('id', auth.userId).single();
  let email = current?.email ?? submittedEmail;
  let emailUnverified = false;

  if (submittedEmail && submittedEmail !== (current?.email || '').toLowerCase()) {
    const { data: confirmedOtp } = await supabase
      .from('profile_email_otps')
      .select('id, expires_at')
      .eq('user_type', 'student')
      .eq('user_id', auth.userId)
      .eq('email', submittedEmail)
      .eq('confirmed', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (confirmedOtp && new Date(confirmedOtp.expires_at) > new Date()) {
      email = submittedEmail;
    } else {
      emailUnverified = true; // keep the existing email, flag it in the redirect
    }
  }

  const { error } = await supabase
    .from('students')
    .update({ full_name, gender, email, phone, address })
    .eq('id', auth.userId);

  if (error) {
    return redirect('/student/profile?error=1');
  }
  if (emailUnverified) {
    return redirect('/student/profile?saved=1&email_unverified=1');
  }

  try {
    const authUpdate: Record<string, string> = {};
    if (email) authUpdate.email = email;
    if (newPassword) authUpdate.password = newPassword;
    if (Object.keys(authUpdate).length) {
      await supabase.auth.updateUser(authUpdate);
    }
  } catch {
    // Non-fatal to the profile save, same as the old app.
  }

  return redirect('/student/profile?saved=1');
};
