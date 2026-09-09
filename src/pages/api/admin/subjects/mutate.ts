import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

const CAN_WRITE = ['super_admin', 'admin', 'proprietor', 'head_teacher', 'principal'];

interface Body {
  action: 'create_bulk' | 'delete' | 'assign' | 'unassign' | 'list_class_subjects';
  id?: string;
  names?: string[];
  codes?: string[];
  classId?: string;
  subjectIds?: string[];
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

  if (body.action === 'create_bulk') {
    // Same shape as addSubjectBulk() (index.html ~7873): empty-name rows
    // are dropped, code defaults to ''.
    const names = (body.names || []).map((n) => n.trim()).filter(Boolean);
    if (!names.length) return new Response(JSON.stringify({ error: 'Enter at least one subject name.' }), { status: 400 });
    const records = names.map((name, i) => ({ name, code: (body.codes?.[i] || '').trim().toUpperCase() }));
    const { data, error } = await supabase.from('subjects').insert(records).select();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true, count: (data || records).length }), { status: 200 });
  }

  if (body.action === 'delete') {
    if (!body.id) return new Response(JSON.stringify({ error: 'Missing subject id.' }), { status: 400 });
    const { error } = await supabase.from('subjects').delete().eq('id', body.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  if (body.action === 'assign') {
    // Same per-subject insert loop as assignSubjectToClass() (index.html
    // ~7888-7894) — a unique-constraint violation (23505) is treated as
    // "already assigned", not an error.
    if (!body.classId) return new Response(JSON.stringify({ error: 'Select a class.' }), { status: 400 });
    const sids = (body.subjectIds || []).filter(Boolean);
    if (!sids.length) return new Response(JSON.stringify({ error: 'Select at least one subject.' }), { status: 400 });
    let added = 0, skipped = 0;
    for (const sid of sids) {
      const { error } = await supabase.from('class_subjects').insert({ class_id: body.classId, subject_id: sid });
      if (error && (error as { code?: string }).code === '23505') skipped++;
      else if (!error) added++;
    }
    return new Response(JSON.stringify({ ok: true, added, skipped }), { status: 200 });
  }

  if (body.action === 'unassign') {
    if (!body.id) return new Response(JSON.stringify({ error: 'Missing class_subjects id.' }), { status: 400 });
    const { error } = await supabase.from('class_subjects').delete().eq('id', body.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  if (body.action === 'list_class_subjects') {
    if (!body.classId) return new Response(JSON.stringify({ error: 'Missing classId.' }), { status: 400 });
    const { data, error } = await supabase
      .from('class_subjects')
      .select('id, subjects(name, code)')
      .eq('class_id', body.classId);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true, rows: data || [] }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Unknown action.' }), { status: 400 });
};
