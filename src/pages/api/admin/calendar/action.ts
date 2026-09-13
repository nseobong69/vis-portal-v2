import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

const ALLOWED = ['super_admin', 'admin', 'proprietor', 'head_teacher', 'principal'];

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ALLOWED);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }
  let body: { action: string; title?: string; event_date?: string; event_type?: string };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON.' }), { status: 400 });
  }
  const { title, event_date, event_type } = body;
  if (!title?.trim() || !event_date) {
    return new Response(JSON.stringify({ error: 'Title and date are required.' }), { status: 400 });
  }
  const supabase = createServerSupabase(cookies);
  const { data, error } = await supabase
    .from('school_calendar')
    .insert({ title: title.trim(), event_date, event_type: event_type || 'event', created_by: auth.userId })
    .select('*').single();
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ ok: true, event: data }), { status: 200 });
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ALLOWED);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }
  let body: { id: string };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON.' }), { status: 400 });
  }
  if (!body.id) return new Response(JSON.stringify({ error: 'Missing id.' }), { status: 400 });
  const supabase = createServerSupabase(cookies);
  const { error } = await supabase.from('school_calendar').delete().eq('id', body.id);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
