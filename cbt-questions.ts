import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

function serverSupabase() {
  return createClient(import.meta.env.PUBLIC_SUPABASE_URL, import.meta.env.PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}

// Matches the old app's comment on get-cbt-questions: "correct_answer
// never reaches browser". We strip it server-side here rather than
// relying on an RLS column policy, so this holds even if RLS is loose.
export const POST: APIRoute = async ({ request }) => {
  let body: { exam_id?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }
  if (!body.exam_id) {
    return new Response(JSON.stringify({ error: 'exam_id is required.' }), { status: 400 });
  }

  const supabase = serverSupabase();
  const { data, error } = await supabase
    .from('cbt_questions')
    .select('id,question_text,option_a,option_b,option_c,option_d,marks,order_index')
    .eq('exam_id', body.exam_id)
    .order('order_index');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  return new Response(JSON.stringify({ questions: data || [] }), { status: 200 });
};
