import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

// Ports renderScholarship()/loadScholarshipList()/removeScholarship()
// (index.html ~25353-25405). Old app's allowed list includes 'cashier',
// which this app's auth system doesn't have yet — omitted, same as the
// Fee Receipts/Scholarship note in AdminLayout.astro.
const SCHOLARSHIP_ROLES = ['super_admin', 'admin', 'proprietor', 'bursar'];

interface Body {
  action: 'list' | 'remove';
  classId?: string;
  studentId?: string;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, SCHOLARSHIP_ROLES);
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

  if (body.action === 'list') {
    let q = supabase.from('students').select('*').eq('scholarship', true).order('full_name');
    if (body.classId) q = q.eq('class_id', body.classId);
    const { data, error } = await q;
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ students: data || [] }), { status: 200 });
  }

  if (body.action === 'remove') {
    if (!body.studentId) return new Response(JSON.stringify({ error: 'Missing studentId.' }), { status: 400 });
    const { error } = await supabase.from('students').update({ scholarship: false }).eq('id', body.studentId);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Unknown action.' }), { status: 400 });
};
