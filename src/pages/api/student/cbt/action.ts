import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';
import { grade } from '../../../../lib/resultCard';

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
//
// RESULTS INTEGRATION (added): mirrors the old app's "Score Type" field
// (index.html ~L10920 — CBT Only / Save as CA Score (out of 30) / Save
// as Exam Score (out of 70)). When an exam's score_type is 'ca' or
// 'test', the percentage scored is scaled to max_score and written into
// results.ca_score for that student/subject/term/session/class. 'exam'
// writes into results.exam_score instead. 'none' behaves exactly as
// before — a submission with no effect on results.
//
// FIXED (found by checking the real results table's constraints): the
// upsert below now sets subject_id (from cbt_exams.subject_id) alongside
// subject_name, not subject_name alone. results has separate unique
// constraints keyed on each — a row written with only subject_name set
// (subject_id left NULL) is invisible to anything that later upserts by
// subject_id (NULL never matches in a unique constraint), which silently
// creates a second, duplicate row for the same real subject instead of
// updating the first. Setting both keeps this write compatible with
// whatever else in the app still writes results by subject_id.

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

    // FIXED (found while checking against the real schema): this route
    // never verified the requesting student was actually eligible for
    // this exam — any authenticated student could POST any examId and
    // take an exam meant for a different class. Now checks class_id
    // membership, or allowed_students if the exam restricts to specific
    // students (cbt_exams.allowed_students is a real column).
    const { data: studentRow } = await supabase.from('students').select('class_id').eq('id', auth.userId).maybeSingle();
    const inAllowedList = Array.isArray(exam.allowed_students) && exam.allowed_students.length > 0;
    if (inAllowedList) {
      if (!exam.allowed_students.includes(auth.userId)) {
        return new Response(JSON.stringify({ error: 'You are not on the list for this exam.' }), { status: 403 });
      }
    } else if (exam.class_id && studentRow?.class_id !== exam.class_id) {
      return new Response(JSON.stringify({ error: 'This exam is not for your class.' }), { status: 403 });
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

    // Fetch the full exam row now, not just questions — score_type/
    // max_score/class_id/subject_name/term/session all live here and are
    // needed for the results write below.
    const { data: exam, error: examErr } = await supabase.from('cbt_exams').select('*').eq('id', body.examId).single();
    if (examErr || !exam) return new Response(JSON.stringify({ error: 'Exam not found.' }), { status: 404 });

    // Same eligibility check as getExam — a direct POST to submit
    // shouldn't be able to skip it.
    const { data: studentRow } = await supabase.from('students').select('class_id').eq('id', auth.userId).maybeSingle();
    const inAllowedList = Array.isArray(exam.allowed_students) && exam.allowed_students.length > 0;
    if (inAllowedList) {
      if (!exam.allowed_students.includes(auth.userId)) {
        return new Response(JSON.stringify({ error: 'You are not on the list for this exam.' }), { status: 403 });
      }
    } else if (exam.class_id && studentRow?.class_id !== exam.class_id) {
      return new Response(JSON.stringify({ error: 'This exam is not for your class.' }), { status: 403 });
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

    // ── Push the graded score into results, if this exam is configured to ──
    let resultsUpdated = false;
    let resultsError: string | null = null;
    if (exam.score_type === 'ca' || exam.score_type === 'test' || exam.score_type === 'exam') {
      const maxScore = Number(exam.max_score) || (exam.score_type === 'exam' ? 70 : 30);
      const scaledScore = Math.round((percentage / 100) * maxScore);
      const field = exam.score_type === 'exam' ? 'exam_score' : 'ca_score';
      const otherField = field === 'ca_score' ? 'exam_score' : 'ca_score';

      // Look up any existing result row for this student/subject/term/
      // session/class so the other component (whichever isn't being set
      // here) isn't lost — we only ever write the one field this exam
      // owns, same conflict key the rest of the app already uses
      // (student_id,subject_name,term,session,class_id).
      const { data: existingResult } = await supabase
        .from('results')
        .select('id, ca_score, exam_score')
        .eq('student_id', auth.userId)
        .eq('subject_name', exam.subject_name)
        .eq('term', exam.term)
        .eq('session', exam.session)
        .eq('class_id', exam.class_id)
        .maybeSingle();

      const otherVal = Number(existingResult?.[otherField]) || 0;
      const total = scaledScore + otherVal;
      const g = grade(total);

      const { error: resErr } = await supabase.from('results').upsert(
        {
          student_id: auth.userId,
          subject_id: exam.subject_id,
          subject_name: exam.subject_name,
          class_id: exam.class_id,
          class_name: exam.class_name,
          term: exam.term,
          session: exam.session,
          [field]: scaledScore,
          total,
          grade: g.g,
          remark: g.r,
          is_absent: false,
        },
        { onConflict: 'student_id,subject_name,term,session,class_id' }
      );
      if (resErr) {
        // Non-fatal: the exam submission itself already succeeded and is
        // saved. Surface the problem so a teacher can fix the results row
        // by hand rather than silently losing the score.
        resultsError = resErr.message;
      } else {
        resultsUpdated = true;
      }
    }

    return new Response(JSON.stringify({ ok: true, submission, resultsUpdated, resultsError }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Unknown action.' }), { status: 400 });
};
