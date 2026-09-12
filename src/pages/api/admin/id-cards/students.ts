import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

// Ported from _idcSelectClass()'s student fetch (index.html ~L30733).
export const GET: APIRoute = async ({ url, cookies }) => {
  const auth = await checkAuth(cookies, ['super_admin', 'admin', 'proprietor', 'head_teacher', 'principal']);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  const classId = url.searchParams.get('class_id');
  if (!classId) return new Response(JSON.stringify({ error: 'Missing class_id.' }), { status: 400 });

  const supabase = createServerSupabase(cookies);
  const { data: students, error } = await supabase
    .from('students')
    .select('*')
    .eq('class_id', classId)
    .order('full_name');

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ students: students || [] }), { status: 200 });
};
