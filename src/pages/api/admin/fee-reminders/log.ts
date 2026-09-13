import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

const REMINDER_ROLES = ['super_admin', 'admin', 'proprietor', 'head_teacher', 'principal', 'bursar'];

// Inserts one row into fee_reminder_log per send attempt — mirrors the
// old app's own two inserts inside runFeeReminders() (~L20446-20452),
// one for a successful send and one for a failed one, both writing the
// same shape of row with only `status`/`error_message` differing.
//
// REQUIRES the fee_reminder_log table from fee-reminders.astro's own
// header comment — this insert will fail with a clear Postgres error
// until that table is created.
interface Body {
  studentId: string;
  studentName: string;
  recipientEmail: string;
  recipientName: string;
  balance: number;
  status: 'sent' | 'failed';
  errorMessage?: string;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, REMINDER_ROLES);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }

  if (!body.studentId || !body.recipientEmail || !body.status) {
    return new Response(JSON.stringify({ error: 'Missing required fields.' }), { status: 400 });
  }

  const supabase = createServerSupabase(cookies);
  const { data, error } = await supabase
    .from('fee_reminder_log')
    .insert({
      student_id: body.studentId,
      student_name: body.studentName || null,
      recipient_email: body.recipientEmail,
      recipient_name: body.recipientName || null,
      balance: body.balance || 0,
      status: body.status,
      error_message: body.errorMessage || null,
    })
    .select('id, sent_at, student_name, recipient_email, balance, status')
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ ok: true, row: data }), { status: 200 });
};
