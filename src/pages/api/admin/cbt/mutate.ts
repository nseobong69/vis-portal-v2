import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

const CBT_ROLES = ['super_admin', 'admin', 'proprietor', 'head_teacher', 'principal', 'teacher', 'subject_teacher'];

function secureCode8() {
  // Mirrors _secureCode8() — an 8-char access code for the exam.
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

interface Body {
  action: 'create' | 'setStatus' | 'delete';
  id?: string;
  title?: string;
  classId?: string;
  className?: string;
  subjectId?: string;
  subjectName?: string;
  durationMinutes?: number;
  term?: string;
  session?: string;
  status?: 'draft' | 'active' | 'completed';
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, CBT_ROLES);
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
    const title = (body.title || '').trim();
    if (!title) return new Response(JSON.stringify({ error: 'Exam title is required.' }), { status: 400 });
    if (!body.classId) return new Response(JSON.stringify({ error: 'Select a class.' }), { status: 400 });
    if (!body.subjectId) return new Response(JSON.stringify({ error: 'Select a subject.' }), { status: 400 });
    const record = {
      title,
      class_id: body.classId,
      class_name: body.className || null,
      subject_id: body.subjectId,
      subject_name: body.subjectName || null,
      duration_minutes: body.durationMinutes && body.durationMinutes > 0 ? body.durationMinutes : 60,
      term: body.term || null,
      session: body.session || null,
      exam_type: 'regular',
      score_type: 'none',
      status: 'draft',
      access_code: secureCode8(),
      created_by: auth.userId,
    };
    const { data, error } = await supabase.from('cbt_exams').insert(record).select().single();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true, exam: data }), { status: 200 });
  }

  if (body.action === 'setStatus') {
    if (!body.id || !body.status) return new Response(JSON.stringify({ error: 'Missing exam id or status.' }), { status: 400 });
    const { error } = await supabase.from('cbt_exams').update({ status: body.status }).eq('id', body.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  if (body.action === 'delete') {
    if (!body.id) return new Response(JSON.stringify({ error: 'Missing exam id.' }), { status: 400 });
    const { error } = await supabase.from('cbt_exams').delete().eq('id', body.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Unknown action.' }), { status: 400 });
};
