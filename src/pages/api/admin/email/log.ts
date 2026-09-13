import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

const ALLOWED_ROLES = ['super_admin', 'admin', 'proprietor', 'head_teacher', 'principal'];

// Ports index.html's email_delivery_log insert/update pair from
// sendEmailDelivery() (~L20296-20351), with one deliberate fix: the old
// app re-found "the row to update" by querying
// .eq('recipient_email',...).eq('subject',...).order('created_at').limit(1)
// after the fact — which silently updates the WRONG row if the same
// person is emailed the same subject twice in quick succession (exactly
// what Fee Reminders does across multiple candidates/runs). This route
// instead returns the new row's real id from 'create', and 'update'
// takes that id directly — no re-matching, no race condition.
interface Body {
  action: 'create' | 'update';
  id?: string;
  recipientEmail?: string;
  recipientName?: string;
  subject?: string;
  status?: 'sent' | 'failed';
  errorMessage?: string;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ALLOWED_ROLES);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }

  const supabase = createServerSupabase(cookies);

  if (body.action === 'create') {
    if (!body.recipientEmail || !body.subject) {
      return new Response(JSON.stringify({ error: 'Missing recipient or subject.' }), { status: 400 });
    }
    const { data, error } = await supabase
      .from('email_delivery_log')
      .insert({
        recipient_email: body.recipientEmail,
        recipient_name: body.recipientName || null,
        subject: body.subject,
        status: 'pending',
        attempts: 1,
        last_attempt: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true, id: data.id }), { status: 200 });
  }

  if (body.action === 'update') {
    if (!body.id || !body.status) return new Response(JSON.stringify({ error: 'Missing id or status.' }), { status: 400 });
    const { error } = await supabase
      .from('email_delivery_log')
      .update({ status: body.status, error_message: body.errorMessage || null })
      .eq('id', body.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Unknown action.' }), { status: 400 });
};
