import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

// Ports sendParentMessage(). The old app trusted a client-held UP.id/
// full_name for sender_id/sender_name; here both come from the
// server-verified session (auth.userId via checkAuth), never from the
// submitted form, so a parent can't spoof another sender.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const auth = await checkAuth(cookies, ['parent']);
  if (auth.status !== 'authorized') {
    return redirect('/login');
  }

  const form = await request.formData();
  const to = String(form.get('to') || 'admin');
  const subject = String(form.get('subject') || '').trim();
  const body = String(form.get('body') || '').trim();

  if (!body) {
    return redirect('/parent/messages?error=empty');
  }

  const supabase = createServerSupabase(cookies);
  const { data: profile } = await supabase.from('parents').select('full_name').eq('id', auth.userId).single();

  const { error } = await supabase.from('direct_messages').insert({
    sender_id: auth.userId,
    sender_type: 'parent',
    sender_name: profile?.full_name ?? null,
    recipient_id: to,
    recipient_type: to,
    recipient_name: to === 'admin' ? 'School Admin' : 'Class Teacher',
    subject,
    body,
    is_read: false,
  });

  if (error) {
    return redirect('/parent/messages?error=1');
  }
  return redirect('/parent/messages?sent=1');
};
