import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

const STAFF_ROLES = [
  'teacher', 'subject_teacher', 'super_admin', 'admin', 'proprietor', 'head_teacher', 'principal',
] as const;

// Ports loadWeekPanel()'s read side — lists attendance_week_logs for a
// session/term/class, used to redraw the week panel after a save
// without a full page reload.
export const GET: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, [...STAFF_ROLES]);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  const url = new URL(request.url);
  const session = url.searchParams.get('session');
  const term = url.searchParams.get('term');
  const classId = url.searchParams.get('class_id');
  if (!session || !term || !classId) {
    return new Response(JSON.stringify({ error: 'session, term and class_id are required.' }), { status: 400 });
  }

  const supabase = createServerSupabase(cookies);
  const { data: weeks, error } = await supabase
    .from('attendance_week_logs')
    .select('*')
    .eq('session', session)
    .eq('term', term)
    .eq('class_id', classId)
    .order('week_number');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  return new Response(JSON.stringify({ weeks: weeks ?? [] }), { status: 200 });
};

// Ports createWeek() — 16-week cap, and only one active (unclosed) week
// per session/term/class at a time, same as the old app.
export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, [...STAFF_ROLES]);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  let body: { session?: string; term?: string; class_id?: string; week_number?: number };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }
  const { session, term, class_id, week_number } = body;
  if (!session || !term || !class_id || !week_number) {
    return new Response(JSON.stringify({ error: 'session, term, class_id and week_number are required.' }), { status: 400 });
  }
  if (week_number > 16) {
    return new Response(JSON.stringify({ error: 'Maximum 16 weeks per term.' }), { status: 400 });
  }

  const supabase = createServerSupabase(cookies);
  const { data: active } = await supabase
    .from('attendance_week_logs')
    .select('id')
    .eq('session', session)
    .eq('term', term)
    .eq('class_id', class_id)
    .eq('status', 'active');
  if (active && active.length > 0) {
    return new Response(JSON.stringify({ error: 'Close the current active week before starting a new one.' }), { status: 409 });
  }

  const { error } = await supabase.from('attendance_week_logs').insert({
    week_number,
    session,
    term,
    class_id,
    status: 'active',
    days_completed: [],
  });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
