import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

// Ports writes to the old app's cbt_violations table (see
// _onExamVisChange / _forceExamSubmit in index.html). Routed through an
// authenticated API endpoint rather than a direct client insert (unlike
// the old app's client-side `DB().from('cbt_violations').insert(...)`)
// so the logged student_id always matches the real session, not
// whatever the client claims.
export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ['student']);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  let body: { exam_id?: string; violation_type?: string; details?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }
  const examId = body.exam_id;
  const violationType = body.violation_type;
  if (!examId || !violationType) {
    return new Response(JSON.stringify({ error: 'exam_id and violation_type are required.' }), { status: 400 });
  }

  const supabase = createServerSupabase(cookies);
  const { error } = await supabase.from('cbt_violations').insert({
    student_id: auth.userId,
    violation_type: violationType,
    details: body.details ? `exam_id=${examId}; ${body.details}` : `exam_id=${examId}`,
    created_at: new Date().toISOString(),
  });

  if (error) {
    // Non-fatal for the exam flow — a logging failure shouldn't block
    // the student's countdown/submit, but the client should know so it
    // can decide whether to retry.
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 200 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
