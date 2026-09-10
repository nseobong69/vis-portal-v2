import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

const CBT_ROLES = ['super_admin', 'admin', 'proprietor', 'head_teacher', 'principal', 'teacher', 'subject_teacher'];

interface Body {
  action: 'add' | 'update' | 'delete';
  examId?: string;
  id?: string;
  questionText?: string;
  optionA?: string;
  optionB?: string;
  optionC?: string;
  optionD?: string;
  correctAnswer?: 'A' | 'B' | 'C' | 'D';
}

// Mirrors the "recalculate marks to distribute 100% equally" step that
// runs after every add/delete (index.html ~L11241-11245, ~L11440).
async function redistributeMarks(supabase: any, examId: string) {
  const { data: allQs } = await supabase.from('cbt_questions').select('id').eq('exam_id', examId);
  const tot = allQs?.length || 1;
  const marksEach = parseFloat((100 / tot).toFixed(4));
  await supabase.from('cbt_questions').update({ marks: marksEach }).eq('exam_id', examId);
  await supabase.from('cbt_exams').update({ total_questions: tot }).eq('id', examId);
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

  if (body.action === 'add') {
    if (!body.examId) return new Response(JSON.stringify({ error: 'Missing exam id.' }), { status: 400 });
    const txt = (body.questionText || '').trim();
    const a = (body.optionA || '').trim();
    const b = (body.optionB || '').trim();
    if (!txt || !a || !b) {
      return new Response(JSON.stringify({ error: 'Question text and at least options A and B are required.' }), { status: 400 });
    }
    const { data: last } = await supabase.from('cbt_questions').select('order_index').eq('exam_id', body.examId).order('order_index', { ascending: false }).limit(1);
    const orderIndex = (last?.[0]?.order_index || 0) + 1;
    const { data, error } = await supabase
      .from('cbt_questions')
      .insert({
        exam_id: body.examId,
        question_text: txt,
        option_a: a,
        option_b: b,
        option_c: (body.optionC || '').trim() || null,
        option_d: (body.optionD || '').trim() || null,
        correct_answer: body.correctAnswer || 'A',
        marks: 1,
        order_index: orderIndex,
      })
      .select()
      .single();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    await redistributeMarks(supabase, body.examId);
    return new Response(JSON.stringify({ ok: true, question: data }), { status: 200 });
  }

  if (body.action === 'update') {
    if (!body.id) return new Response(JSON.stringify({ error: 'Missing question id.' }), { status: 400 });
    const patch: Record<string, any> = {};
    if (body.questionText != null) patch.question_text = body.questionText.trim();
    if (body.optionA != null) patch.option_a = body.optionA.trim();
    if (body.optionB != null) patch.option_b = body.optionB.trim();
    if (body.optionC != null) patch.option_c = body.optionC.trim() || null;
    if (body.optionD != null) patch.option_d = body.optionD.trim() || null;
    if (body.correctAnswer != null) patch.correct_answer = body.correctAnswer;
    const { error } = await supabase.from('cbt_questions').update(patch).eq('id', body.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  if (body.action === 'delete') {
    if (!body.id || !body.examId) return new Response(JSON.stringify({ error: 'Missing question or exam id.' }), { status: 400 });
    const { error } = await supabase.from('cbt_questions').delete().eq('id', body.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    await redistributeMarks(supabase, body.examId);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Unknown action.' }), { status: 400 });
};
