import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

// Ports saveAttPrefs() — upserts the signed-in staff member's
// session/term/class academic context, keyed by teacher_id so it
// auto-loads next time (see index.html's `AUTO-LOADED` chip).
export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, [
    'teacher', 'subject_teacher', 'super_admin', 'admin', 'proprietor', 'head_teacher', 'principal',
  ]);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  let body: { session?: string; term?: string; class_id?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }
  const { session, term, class_id } = body;
  if (!session || !term || !class_id) {
    return new Response(JSON.stringify({ error: 'Session, term and class are required.' }), { status: 400 });
  }

  const supabase = createServerSupabase(cookies);
  const { error } = await supabase.from('teacher_attendance_prefs').upsert(
    {
      teacher_id: auth.userId,
      session,
      term,
      class_id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'teacher_id' }
  );

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
