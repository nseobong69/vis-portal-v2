import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

// Ports writes to the old app's cbt_snapshots table (see the snapshot
// helper near index.html's `DB().from('cbt_snapshots').insert(...)`,
// used for both the initial identity photo and periodic proctoring
// snapshots during the exam). Routed through an authenticated endpoint
// so the recorded student_id always matches the real session.
export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ['student']);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  let body: { exam_id?: string; image_url?: string; snap_number?: number };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }
  const examId = body.exam_id;
  const imageUrl = body.image_url;
  if (!examId || !imageUrl) {
    return new Response(JSON.stringify({ error: 'exam_id and image_url are required.' }), { status: 400 });
  }

  const supabase = createServerSupabase(cookies);
  const { error } = await supabase.from('cbt_snapshots').insert({
    student_id: auth.userId,
    exam_id: examId,
    snap_number: body.snap_number ?? null,
    image_url: imageUrl,
    taken_at: new Date().toISOString(),
  });

  if (error) {
    // Non-fatal for the exam flow, same "Silent fail — never interrupt
    // the exam" posture as the old app's snapshot helper.
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 200 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
