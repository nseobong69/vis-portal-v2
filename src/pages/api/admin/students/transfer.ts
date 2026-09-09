import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

const CAN_TRANSFER = ['super_admin', 'admin', 'head_teacher', 'principal', 'proprietor'];

interface Body {
  toClassId: string;
  toClassName: string;
  students: Array<{ id: string; newType: 'old' | 'new' }>;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, CAN_TRANSFER);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }

  if (!body.toClassId) return new Response(JSON.stringify({ error: 'Select destination class.' }), { status: 400 });
  if (!body.students?.length) return new Response(JSON.stringify({ error: 'No students selected.' }), { status: 400 });

  const supabase = createServerSupabase(cookies);
  let ok = 0, errs = 0;

  // Same per-student update as executeStudentTransfer() (index.html
  // ~8483-8489) — including the fee_payments.class_name sync.
  for (const s of body.students) {
    const { error } = await supabase
      .from('students')
      .update({ class_id: body.toClassId, class_name: body.toClassName, student_type: s.newType || 'old' })
      .eq('id', s.id);
    if (error) { errs++; continue; }
    await supabase.from('fee_payments').update({ class_name: body.toClassName }).eq('student_id', s.id);
    ok++;
  }

  return new Response(JSON.stringify({ ok, errs }), { status: 200 });
};
