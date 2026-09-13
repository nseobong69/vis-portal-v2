import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

// Ported from loadACStudentList()/renderACNewStaff()'s initial fetch
// (index.html ~L18578-18582, ~18694).
export const GET: APIRoute = async ({ url, cookies }) => {
  const auth = await checkAuth(cookies, ['super_admin', 'admin', 'proprietor', 'head_teacher', 'principal']);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  const type = url.searchParams.get('type');
  const supabase = createServerSupabase(cookies);

  if (type === 'staff') {
    if (!['super_admin', 'admin'].includes(auth.role)) {
      return new Response(JSON.stringify({ error: 'Only Super Admin and Admin can create staff accounts.' }), { status: 403 });
    }
    const { data: staff, error } = await supabase
      .from('profiles').select('id, full_name, phone, role, roles')
      .eq('has_account', false).order('full_name');
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ staff: staff || [] }), { status: 200 });
  }

  const classId = url.searchParams.get('class_id');
  if (!classId) return new Response(JSON.stringify({ error: 'Missing class_id.' }), { status: 400 });
  const { data: students, error } = await supabase
    .from('students').select('id, full_name, gender, class_name, admission_number, has_account')
    .eq('class_id', classId).eq('has_account', false).order('full_name');
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ students: students || [] }), { status: 200 });
};
