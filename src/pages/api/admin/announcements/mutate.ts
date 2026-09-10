import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

const ANN_POSTER_ROLES = [
  'super_admin', 'admin', 'proprietor', 'head_teacher', 'principal', 'teacher', 'subject_teacher',
];
const ANN_FULL_CONTROL = ['super_admin', 'admin', 'proprietor', 'head_teacher', 'principal'];

interface Body {
  action: 'create' | 'delete';
  id?: string;
  title?: string;
  body?: string;
  audience?: 'all' | 'students' | 'staff' | 'class';
  classId?: string;
  className?: string;
  authorName?: string;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ANN_POSTER_ROLES);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  let payload: Body;
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }

  const supabase = createServerSupabase(cookies);

  if (payload.action === 'create') {
    const title = (payload.title || '').trim();
    const body = (payload.body || '').trim();
    if (!title || !body) {
      return new Response(JSON.stringify({ error: 'Title and message are both required.' }), { status: 400 });
    }
    // subject_teacher may only target their own class — same restriction as
    // the old app's "My Class Only" fixed option for that role.
    const audience = auth.role === 'subject_teacher' ? 'class' : payload.audience || 'all';
    const record = {
      title,
      body,
      audience,
      class_id: audience === 'class' ? payload.classId || null : null,
      class_name: audience === 'class' ? payload.className || null : null,
      author: payload.authorName || auth.role,
      author_id: auth.userId,
    };
    const { data, error } = await supabase.from('announcements').insert(record).select().single();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true, announcement: data }), { status: 200 });
  }

  if (payload.action === 'delete') {
    if (!payload.id) return new Response(JSON.stringify({ error: 'Missing announcement id.' }), { status: 400 });
    // Full-control roles can delete anything; everyone else only their own —
    // same rule shown next to the delete button in the old app's template.
    let q = supabase.from('announcements').delete().eq('id', payload.id);
    if (!ANN_FULL_CONTROL.includes(auth.role)) {
      q = q.eq('author_id', auth.userId);
    }
    const { error, count } = await q.select('id', { count: 'exact' });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    if (!count) return new Response(JSON.stringify({ error: 'Not found, or not yours to delete.' }), { status: 403 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Unknown action.' }), { status: 400 });
};
