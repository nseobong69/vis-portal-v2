import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

function serverSupabase() {
  return createClient(import.meta.env.PUBLIC_SUPABASE_URL, import.meta.env.PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}

// Equivalent of the old app's `grade-cbt-exam` Edge Function, scoped to
// the admission-aptitude case only (no face verification / invigilator
// PIN / violation tracking — those belong to the full staff-proctored CBT
// module, a separate Feature Checklist row from public Admissions).
export const POST: APIRoute = async ({ request }) => {
  let body: { exam_id?: string; answers?: Record<string, string>; applicant_name?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }
  const { exam_id, answers = {}, applicant_name } = body;
  if (!exam_id) {
    return new Response(JSON.stringify({ error: 'exam_id is required.' }), { status: 400 });
  }

  const supabase = serverSupabase();
  const { data: questions, error } = await supabase
    .from('cbt_questions')
    .select('id,correct_answer,marks')
    .eq('exam_id', exam_id);

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

  // Best-effort submission record — non-fatal if the table/columns differ,
  // since the score itself (returned below) is what the wizard needs to
  // proceed and gets saved onto the admissions row on final submit too.
  try {
    await supabase.from('cbt_submissions').insert({
      exam_id,
      student_name: applicant_name || null,
      score,
      total_marks: totalMarks,
      percentage,
      answers,
      submitted_at: new Date().toISOString(),
    });
  } catch {
    // non-fatal
  }

  return new Response(JSON.stringify({ score, total_marks: totalMarks, percentage }), { status: 200 });
};
