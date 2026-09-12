import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

const ALLOWED = ['super_admin', 'admin', 'proprietor', 'head_teacher', 'principal'];

// Ported from loadRPStudents() (index.html ~L24322-24329) — students in
// the class, plus any existing result_pins_v2 rows for this exact
// (class, term, session), joined client-side into a pinMap.
export const GET: APIRoute = async ({ url, cookies }) => {
  const auth = await checkAuth(cookies, ALLOWED);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  const cid = url.searchParams.get('class_id');
  const term = url.searchParams.get('term') || '1st Term';
  const sess = url.searchParams.get('session') || '2025/2026';
  if (!cid) return new Response(JSON.stringify({ error: 'Missing class_id.' }), { status: 400 });

  const supabase = createServerSupabase(cookies);
  const [{ data: students, error: se }, { data: pins, error: pe }] = await Promise.all([
    supabase.from('students').select('id, full_name, admission_number').eq('class_id', cid).order('full_name'),
    supabase.from('result_pins_v2').select('*').eq('class_id', cid).eq('term', term).eq('session', sess),
  ]);

  if (se) return new Response(JSON.stringify({ error: se.message }), { status: 500 });
  if (pe) return new Response(JSON.stringify({ error: pe.message }), { status: 500 });

  return new Response(JSON.stringify({ students: students || [], pins: pins || [] }), { status: 200 });
};
