import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

// Ports _fnoLoadStudents()/_fnoRenderStaffTab()/_fnoConfirmStudents()/
// _fnoConfirmStaff() (index.html ~8044-8196). Same reasoning as every
// other admin tool in this app: reads AND writes go through an
// authenticated server route, never a direct browser-side Supabase call.
const ADMIN_ROLES = ['super_admin', 'admin', 'proprietor'];

interface ReorderItem { id: string; fullName: string; surnameIdx: number; firstIdx: number | null }
interface Body {
  action: 'studentsByClass' | 'staffList' | 'applyStudents' | 'applyStaff';
  classId?: string;
  items?: ReorderItem[];
}

function reorderNameFull(full: string, surnameIdx: number | null, firstIdx: number | null): string {
  const parts = (full || '').trim().split(/\s+/).filter(Boolean);
  if (surnameIdx == null || isNaN(surnameIdx) || surnameIdx < 0 || surnameIdx >= parts.length) return full;
  const surname = parts[surnameIdx];
  let firstName: string | null = null;
  const usedIdx = new Set([surnameIdx]);
  if (firstIdx != null && !isNaN(firstIdx) && firstIdx >= 0 && firstIdx < parts.length && firstIdx !== surnameIdx) {
    firstName = parts[firstIdx];
    usedIdx.add(firstIdx);
  }
  const middle = parts.filter((_, i) => !usedIdx.has(i));
  const tail = [firstName, ...middle].filter(Boolean) as string[];
  return surname + (tail.length ? ' ' + tail.join(' ') : '');
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ADMIN_ROLES);
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

  if (body.action === 'studentsByClass') {
    if (!body.classId) return new Response(JSON.stringify({ error: 'Missing classId.' }), { status: 400 });
    const { data, error } = await supabase
      .from('students')
      .select('id, full_name, admission_number')
      .eq('class_id', body.classId)
      .order('full_name');
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ students: data || [] }), { status: 200 });
  }

  if (body.action === 'staffList') {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .neq('role', 'student')
      .order('full_name');
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ staff: data || [] }), { status: 200 });
  }

  if (body.action === 'applyStudents' || body.action === 'applyStaff') {
    if (!body.items?.length) {
      return new Response(JSON.stringify({ error: 'Select at least one row.' }), { status: 400 });
    }
    const table = body.action === 'applyStudents' ? 'students' : 'profiles';
    let ok = 0, fail = 0;
    for (const item of body.items) {
      const swapped = reorderNameFull(item.fullName, item.surnameIdx, item.firstIdx);
      const { error } = await supabase.from(table).update({ full_name: swapped }).eq('id', item.id);
      if (error) fail++; else ok++;
    }
    return new Response(JSON.stringify({ ok: true, applied: ok, failed: fail }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Unknown action.' }), { status: 400 });
};
