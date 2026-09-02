import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

// Ports the question-fetch half of the old app's get-cbt-questions Edge
// Function. correct_answer is stripped server-side (never selected at
// all here), same guarantee as the Admissions aptitude test's
// cbt-questions.ts. Also re-checks that this student hasn't already
// submitted — the client shouldn't be able to load a fresh question set
// after a retake attempt just by racing the UI state.
export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ['student']);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  let body: { exam_id?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }
  const examId = body.exam_id;
  if (!examId) {
    return new Response(JSON.stringify({ error: 'exam_id is required.' }), { status: 400 });
  }

  const supabase = createServerSupabase(cookies);

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
    .select('id, question_text, option_a, option_b, option_c, option_d, order_index')
    .eq('exam_id', examId)
    .order('order_index');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  return new Response(JSON.stringify({ questions: questions || [] }), { status: 200 });
};
