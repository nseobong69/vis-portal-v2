import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

// Same role gate as renderStudents()'s canAdd/canTransfer/canDel checks
// (index.html ~7908-7913): add/edit is broader, delete is super_admin only.
const CAN_WRITE = ['super_admin', 'admin', 'head_teacher', 'principal', 'proprietor', 'teacher'];
const CAN_DELETE = ['super_admin'];

interface StudentFields {
  surname: string;
  first_name?: string;
  other_names?: string;
  email?: string;
  class_id: string;
  class_name: string;
  gender: string;
  date_of_birth?: string;
  address?: string;
  parent_name?: string;
  parent_phone?: string;
  parent_address?: string;
  student_type?: string;
  scholarship?: boolean;
}

interface Body {
  action: 'create' | 'update' | 'delete' | 'toggle_block';
  id?: string;
  fields?: StudentFields;
  blocked?: boolean;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ['super_admin', 'admin', 'head_teacher', 'principal', 'proprietor', 'teacher']);
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

  if (body.action === 'create' || body.action === 'update') {
    if (!CAN_WRITE.includes(auth.role!)) {
      return new Response(JSON.stringify({ error: 'Not authorized to add/edit students.' }), { status: 401 });
    }
    const f = body.fields;
    if (!f) return new Response(JSON.stringify({ error: 'Missing fields.' }), { status: 400 });

    const surname = (f.surname || '').trim();
    if (!surname) return new Response(JSON.stringify({ error: 'Surname is required.' }), { status: 400 });
    if (!f.class_id) return new Response(JSON.stringify({ error: 'Class is required.' }), { status: 400 });

    const first_name = (f.first_name || '').trim();
    const other_names = (f.other_names || '').trim();
    // Same full_name assembly as addStudent()/saveStudent(): Surname [First] [Other].
    const full_name = [surname, first_name, other_names].filter(Boolean).join(' ');

    const row: Record<string, unknown> = {
      full_name,
      surname,
      first_name: first_name || null,
      other_names: other_names || null,
      class_id: f.class_id,
      class_name: f.class_name || '',
      gender: f.gender || null,
      date_of_birth: f.date_of_birth || null,
      address: (f.address || '').trim() || null,
      parent_name: (f.parent_name || '').trim() || null,
      parent_phone: (f.parent_phone || '').trim() || null,
      parent_address: (f.parent_address || '').trim() || null,
      scholarship: f.scholarship || false,
    };

    if (body.action === 'create') {
      row.email = (f.email || '').trim().toLowerCase() || null;
      row.has_account = false;
      row.blocked = false;
      row.cleared = false;
      row.student_type = f.student_type || 'new';
      row.class_join_year = new Date().getFullYear();
      const { error, data } = await supabase.from('students').insert(row).select('id').single();
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
      return new Response(JSON.stringify({ ok: true, id: data.id }), { status: 200 });
    } else {
      if (!body.id) return new Response(JSON.stringify({ error: 'Missing student id.' }), { status: 400 });
      row.student_type = f.student_type || 'new';
      if (f.email !== undefined) row.email = (f.email || '').trim().toLowerCase() || null;
      const { error } = await supabase.from('students').update(row).eq('id', body.id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
  }

  if (body.action === 'toggle_block') {
    if (!CAN_WRITE.includes(auth.role!)) {
      return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
    }
    if (!body.id) return new Response(JSON.stringify({ error: 'Missing student id.' }), { status: 400 });
    const { error } = await supabase.from('students').update({ blocked: !!body.blocked }).eq('id', body.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  if (body.action === 'delete') {
    // Same super_admin-only restriction as the delete button's canDel check.
    if (!CAN_DELETE.includes(auth.role!)) {
      return new Response(JSON.stringify({ error: 'Only super_admin can delete students.' }), { status: 401 });
    }
    if (!body.id) return new Response(JSON.stringify({ error: 'Missing student id.' }), { status: 400 });
    const { error } = await supabase.from('students').delete().eq('id', body.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Unknown action.' }), { status: 400 });
};
