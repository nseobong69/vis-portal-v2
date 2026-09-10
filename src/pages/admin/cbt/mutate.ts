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
  scoreType?: 'none' | 'ca' | 'test' | 'exam';
  maxScore?: number;
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
    // score_type mirrors the old app's own "Score Type" field (index.html
    // ~L10920: CBT Only / Save as CA Score (out of 30) / Save as Exam
    // Score (out of 70)) — extended here with a third label, 'test',
    // per request. 'ca' and 'test' both write into results.ca_score;
    // 'exam' writes into results.exam_score (see api/student/cbt/action.ts's
    // submit handler). max_score is the old app's fixed 30/70 made
    // editable instead of hardcoded.
    const scoreType = body.scoreType || 'none';
    const defaultMax = scoreType === 'exam' ? 70 : 30;
    const maxScore = body.maxScore && body.maxScore > 0 ? body.maxScore : defaultMax;
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
      score_type: scoreType,
      max_score: scoreType === 'none' ? null : maxScore,
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
    // Mirrors activateExamWithToast()'s guard (index.html ~L10586):
    // "Add questions before activating the exam." — a student should
    // never be able to land on a live exam with nothing to answer.
    if (body.status === 'active') {
      const { count } = await supabase.from('cbt_questions').select('id', { count: 'exact', head: true }).eq('exam_id', body.id);
      if (!count) {
        return new Response(JSON.stringify({ error: 'Add questions before activating this exam.' }), { status: 400 });
      }
    }
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
