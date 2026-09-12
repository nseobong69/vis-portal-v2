import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

const ALLOWED = ['super_admin', 'admin', 'proprietor', 'head_teacher', 'principal'];

interface Body {
  action: 'generate' | 'delete';
  class_id?: string;
  class_name?: string;
  exam_id?: string;
  codes?: string[]; // pre-generated client-side via crypto, same as _secureRandStr
  id?: string;
}

// Ported from generateAptCodes()/deleteAptCode() (index.html ~L24544-24555).
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

  if (body.action === 'generate') {
    if (!body.class_id || !body.exam_id || !body.codes?.length) {
      return new Response(JSON.stringify({ error: 'Select class and aptitude test.' }), { status: 400 });
    }
    const rows = body.codes.map((code) => ({
      code, class_id: body.class_id, class_name: body.class_name || '', exam_id: body.exam_id,
      status: 'active', created_by: auth.userId,
    }));
    const { error } = await supabase.from('aptitude_codes').insert(rows);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true, count: rows.length }), { status: 200 });
  }

  if (body.action === 'delete') {
    if (!body.id) return new Response(JSON.stringify({ error: 'Missing id.' }), { status: 400 });
    const { error } = await supabase.from('aptitude_codes').delete().eq('id', body.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Unknown action.' }), { status: 400 });
};
