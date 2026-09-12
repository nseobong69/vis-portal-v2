import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

const ALLOWED_ROLES = ['super_admin', 'admin', 'proprietor', 'head_teacher', 'principal'];

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ALLOWED_ROLES);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }

  const supabase = createServerSupabase(cookies);

  // ── ADD ──────────────────────────────────────────────────────────────────
  if (body.action === 'add') {
    const { full_name, email, phone, address, relationship } = body;
    if (!full_name?.trim()) {
      return new Response(JSON.stringify({ error: 'Full name is required.' }), { status: 400 });
    }
    const { data: parent, error } = await supabase
      .from('parents')
      .insert({ full_name: full_name.trim(), email: email || null, phone: phone || null, address: address || null, relationship: relationship || null, has_account: false })
      .select('*')
      .single();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true, parent }), { status: 200 });
  }

  // ── EDIT ─────────────────────────────────────────────────────────────────
  if (body.action === 'edit') {
    const { id, full_name, email, phone, address } = body;
    if (!id) return new Response(JSON.stringify({ error: 'Missing id.' }), { status: 400 });
    const { data: parent, error } = await supabase
      .from('parents')
      .update({ full_name: full_name?.trim(), email: email || null, phone: phone || null, address: address || null })
      .eq('id', id)
      .select('*')
      .single();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true, parent }), { status: 200 });
  }

  // ── REMOVE ───────────────────────────────────────────────────────────────
  if (body.action === 'remove') {
    const { id } = body;
    if (!id) return new Response(JSON.stringify({ error: 'Missing id.' }), { status: 400 });
    const { error } = await supabase.from('parents').delete().eq('id', id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  // ── LINK ─────────────────────────────────────────────────────────────────
  if (body.action === 'link') {
    const { parent_id, student_ids, linked_names } = body;
    if (!parent_id) return new Response(JSON.stringify({ error: 'Missing parent_id.' }), { status: 400 });

    // Delete existing links then insert new ones
    await supabase.from('parent_child_links').delete().eq('parent_id', parent_id);
    if (student_ids?.length) {
      const rows = student_ids.map((sid: string) => ({ parent_id, student_id: sid }));
      const { error } = await supabase.from('parent_child_links').insert(rows);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    // Keep legacy fields in sync
    const { error } = await supabase
      .from('parents')
      .update({ student_ids: student_ids || [], linked_students: (linked_names || []).join(', ') })
      .eq('id', parent_id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

    // Update student records with parent_id
    for (const sid of (student_ids || [])) {
      await supabase.from('students').update({ parent_id }).eq('id', sid);
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Unknown action.' }), { status: 400 });
};
