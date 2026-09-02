import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

function serverSupabase() {
  return createClient(import.meta.env.PUBLIC_SUPABASE_URL, import.meta.env.PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}

export const POST: APIRoute = async ({ request }) => {
  let body: { class_name?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }
  const className = (body.class_name || '').trim();
  if (!className) {
    return new Response(JSON.stringify({ required: false, exam: null }), { status: 200 });
  }

  const supabase = serverSupabase();
  const { data, error } = await supabase
    .from('cbt_exams')
    .select('id,title,duration_minutes,total_questions')
    .eq('exam_type', 'aptitude')
    .eq('status', 'active')
    .ilike('class_name', className)
    .limit(1);

  if (error || !data?.length) {
    return new Response(JSON.stringify({ required: false, exam: null }), { status: 200 });
  }
  return new Response(JSON.stringify({ required: true, exam: data[0] }), { status: 200 });
};
