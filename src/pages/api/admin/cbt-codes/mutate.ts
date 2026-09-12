import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

const ALLOWED = ['super_admin', 'admin', 'proprietor', 'head_teacher', 'principal'];

interface Body {
  action: 'generate_walkin' | 'regenerate';
  class_name?: string;
  exam_id?: string;
  codes?: string[]; // pre-generated client-side, same as _secureCode8()
  exam_id_regen?: string;
  new_code?: string;
}

// Ported from generateWalkinCBTCode()/regenCBTCode() (index.html ~L24193-24211, ~24239-24245).
export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ALLOWED);
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

  if (body.action === 'generate_walkin') {
    if (!body.class_name?.trim()) return new Response(JSON.stringify({ error: 'Enter the class for these codes.' }), { status: 400 });
    if (!body.exam_id) return new Response(JSON.stringify({ error: 'Select a linked exam.' }), { status: 400 });
    if (!body.codes?.length) return new Response(JSON.stringify({ error: 'No codes given.' }), { status: 400 });

    const rows = body.codes.map((code) => ({
      code, class_name: body.class_name!.trim(), exam_id: body.exam_id, created_by: auth.userId,
      created_at: new Date().toISOString(), status: 'active',
    }));
    const { error } = await supabase.from('cbt_walkin_codes').insert(rows);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true, codes: body.codes }), { status: 200 });
  }

  if (body.action === 'regenerate') {
    if (!body.exam_id_regen || !body.new_code) return new Response(JSON.stringify({ error: 'Missing exam or code.' }), { status: 400 });
    const { error } = await supabase.from('cbt_exams').update({ access_code: body.new_code }).eq('id', body.exam_id_regen);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Unknown action.' }), { status: 400 });
};
