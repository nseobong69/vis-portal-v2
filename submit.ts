import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

// Ports the grading half of the old app's grade-cbt-exam Edge Function
// for a direct student submission (as opposed to the Admissions
// aptitude-test variant already built in Phase 3b, which grades an
// anonymous applicant rather than a logged-in student.id). Called both
// on a normal submit and on a violation-triggered auto-submit (see
// ExamRunner.tsx / log-violation.ts / verify-invigilator-pin.ts) — this
// endpoint doesn't need to know which, since the violation itself is
// logged separately before this fires. Still NOT here: camera/face
// verification and snapshotting (cbt_snapshots) — that's the larger,
// separate migration item described in ExamRunner.tsx's header comment.
export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ['student']);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  let body: { exam_id?: string; answers?: Record<string, string> };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }
  const examId = body.exam_id;
  const answers = body.answers || {};
  if (!examId) {
    return new Response(JSON.stringify({ error: 'exam_id is required.' }), { status: 400 });
  }

  const supabase = createServerSupabase(cookies);

  // Server-side re-check: no retakes, even if the client raced past its
  // own "already submitted" guard.
  const { data: existing } = await supabase
    .from('cbt_submissions')
    .select('id')
    .eq('exam_id', examId)
    .eq('student_id', auth.userId)
    .maybeSingle();
  if (existing) {
    return new Response(JSON.stringify({ error: 'You have already submitted this exam.' }), { status: 409 });
  }

  const { data: questions, error } = await supabase
    .from('cbt_questions')
    .select('id, correct_answer, marks')
    .eq('exam_id', examId);
  if (error || !questions?.length) {
    return new Response(JSON.stringify({ error: error?.message || 'No questions found for this exam.' }), { status: 400 });
  }

  let score = 0;
  const totalMarks = questions.reduce((sum, q) => sum + (q.marks ?? 1), 0);
  for (const q of questions) {
    const given = answers[q.id];
    if (given && given === q.correct_answer) score += q.marks ?? 1;
  }
  const percentage = totalMarks > 0 ? parseFloat(((score / totalMarks) * 100).toFixed(2)) : 0;

  const { error: insertError } = await supabase.from('cbt_submissions').insert({
    exam_id: examId,
    student_id: auth.userId,
    score,
    total_marks: totalMarks,
    percentage,
    answers,
    submitted_at: new Date().toISOString(),
  });
  if (insertError) {
    return new Response(JSON.stringify({ error: insertError.message }), { status: 500 });
  }

  // Mark the per-student access code (if any) used, so it can't be
  // reused — mirrors the "No Retake" lock the listing screen shows.
  try {
    await supabase
      .from('cbt_student_codes')
      .update({ status: 'used' })
      .eq('exam_id', examId)
      .eq('student_id', auth.userId);
  } catch {
    // non-fatal
  }

  return new Response(JSON.stringify({ score, total_marks: totalMarks, percentage }), { status: 200 });
};
