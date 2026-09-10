import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

// NOT PORTED (see conversation notes): face verification at exam start,
// tab-switch/resize/noise violation logging (cbt_violations), and
// periodic webcam snapshots (cbt_snapshots) — those need camera/media
// APIs and a proctoring policy this pass doesn't build. What IS kept
// from the old app's security model: correct_answer is never sent to
// the browser (the old app achieved this via a Supabase Edge Function;
// this route achieves the same end result by stripping it server-side
// before responding), retakes are blocked, and access codes + time
// windows are enforced.

interface Body {
  action: 'getExam' | 'submit';
  examId?: string;
  accessCode?: string;
  answers?: Record<string, string>; // { questionId: 'A'|'B'|'C'|'D' }
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ['student']);
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

  if (body.action === 'getExam') {
    if (!body.examId) return new Response(JSON.stringify({ error: 'Missing exam id.' }), { status: 400 });
    const { data: exam, error: examErr } = await supabase.from('cbt_exams').select('*').eq('id', body.examId).single();
    if (examErr || !exam) return new Response(JSON.stringify({ error: 'Exam not found.' }), { status: 404 });

    if (exam.status !== 'active') {
      return new Response(JSON.stringify({ error: 'This exam is not currently active.' }), { status: 403 });
    }
    if (exam.end_at && new Date(exam.end_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'This exam has already closed.' }), { status: 403 });
    }
    if (exam.start_at && new Date(exam.start_at) > new Date()) {
      return new Response(JSON.stringify({ error: 'This exam has not started yet.' }), { status: 403 });
    }
    if (exam.access_code && exam.access_code !== body.accessCode) {
      return new Response(JSON.stringify({ error: 'Invalid access code.', needsCode: true }), { status: 401 });
    }

    // Block re-take — mirrors the old app's existSub check.
    const { data: existing } = await supabase
      .from('cbt_submissions')
      .select('score, total_marks, percentage, submitted_at')
      .eq('exam_id', body.examId).eq('student_id', auth.userId).limit(1);
    if (existing?.length) {
      return new Response(JSON.stringify({ error: 'Already submitted.', alreadySubmitted: existing[0] }), { status: 409 });
    }

    const { data: questions } = await supabase
      .from('cbt_questions')
      .select('id, question_text, option_a, option_b, option_c, option_d, marks, order_index')
      .eq('exam_id', body.examId)
      .order('order_index');
    if (!questions?.length) {
      return new Response(JSON.stringify({ error: 'This exam has no questions yet.' }), { status: 404 });
    }

    return new Response(
      JSON.stringify({
        exam: { id: exam.id, title: exam.title, duration_minutes: exam.duration_minutes, class_name: exam.class_name, subject_name: exam.subject_name },
        questions, // correct_answer intentionally excluded from the select above
      }),
      { status: 200 }
    );
  }

  if (body.action === 'submit') {
    if (!body.examId) return new Response(JSON.stringify({ error: 'Missing exam id.' }), { status: 400 });

    // Re-check retake block server-side at submit time too — a second
    // browser tab shouldn't be able to double-submit.
    const { data: existing } = await supabase
      .from('cbt_submissions')
      .select('id')
      .eq('exam_id', body.examId).eq('student_id', auth.userId).limit(1);
    if (existing?.length) {
      return new Response(JSON.stringify({ error: 'This exam has already been submitted.' }), { status: 409 });
    }

    const { data: questions, error: qErr } = await supabase
      .from('cbt_questions')
      .select('id, correct_answer, marks')
      .eq('exam_id', body.examId);
    if (qErr || !questions?.length) {
      return new Response(JSON.stringify({ error: 'Could not load exam questions for grading.' }), { status: 500 });
    }

    const answers = body.answers || {};
    let score = 0;
    const totalMarks = questions.reduce((a, q) => a + Number(q.marks), 0);
    for (const q of questions) {
      if (answers[q.id] && answers[q.id] === q.correct_answer) score += Number(q.marks);
    }
    const percentage = totalMarks > 0 ? parseFloat(((score / totalMarks) * 100).toFixed(2)) : 0;

    const { data: submission, error } = await supabase
      .from('cbt_submissions')
      .insert({
        exam_id: body.examId,
        student_id: auth.userId,
        answers,
        score,
        total_marks: totalMarks,
        percentage,
        submitted_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

    return new Response(JSON.stringify({ ok: true, submission }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Unknown action.' }), { status: 400 });
};
