import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

const CAN_WRITE = ['super_admin', 'admin', 'proprietor', 'head_teacher', 'principal'];

interface Body {
  action: 'create' | 'update' | 'delete';
  id?: string;
  name?: string;
  arm?: string;
  level?: string;
  class_teacher_id?: string | null;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, CAN_WRITE);
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

  if (body.action === 'create') {
    // Same three fields as addClass() (index.html ~7764) — class_teacher_id
    // is only ever set from editClass(), never at creation.
    const name = (body.name || '').trim();
    if (!name) return new Response(JSON.stringify({ error: 'Select a class or enter a custom name.' }), { status: 400 });
    const { error } = await supabase.from('classes').insert({
      name, arm: (body.arm || '').trim(), level: body.level || 'primary',
    });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  if (body.action === 'update') {
    if (!body.id) return new Response(JSON.stringify({ error: 'Missing class id.' }), { status: 400 });
    // Same field set as saveEditClass() (index.html ~7782) — level isn't
    // editable there, only name/arm/class_teacher_id.
    const { error } = await supabase.from('classes').update({
      name: body.name, arm: body.arm, class_teacher_id: body.class_teacher_id || null,
    }).eq('id', body.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  if (body.action === 'delete') {
    if (!body.id) return new Response(JSON.stringify({ error: 'Missing class id.' }), { status: 400 });
    const { error } = await supabase.from('classes').delete().eq('id', body.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Unknown action.' }), { status: 400 });
};
