import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

// Ports the old app's `verify-invigilator-pin` Edge Function for the
// student-CBT tab-switch override (see index.html's fv-invig-btn2 /
// the "Invigilator PIN override" comment). Same non-negotiable the old
// app called out: "PIN verified server-side — never fetched to
// browser". school_settings.invigilator_pin is never selected into a
// response body here, only compared server-side.
//
// Scoped to the tab-switch/violation override only — NOT the face-
// verification photo-bypass flow this same Edge Function also gated in
// the old app (camera capture, face-api.js, Cloudinary snapshot upload
// live in cbt_snapshots and are a separate, larger migration item; see
// Phase 3d's "CBT exam-taking engine ownership" open decision).
export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ['student']);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  let body: { pin?: string; exam_id?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }
  const pin = (body.pin || '').trim();
  const examId = body.exam_id;
  if (!pin || !examId) {
    return new Response(JSON.stringify({ error: 'pin and exam_id are required.' }), { status: 400 });
  }

  const supabase = createServerSupabase(cookies);

  const { data: settings } = await supabase
    .from('school_settings')
    .select('invigilator_pin')
    .eq('id', 1)
    .single();

  const valid = !!settings?.invigilator_pin && pin === settings.invigilator_pin;

  // Audit log either way — matches the old app's "Audit log written by
  // verify-invigilator-pin Edge Function" comment. A failed attempt is
  // itself signal (a student guessing at the PIN), so it's logged too.
  try {
    await supabase.from('cbt_violations').insert({
      student_id: auth.userId,
      violation_type: valid ? 'invigilator_override' : 'invigilator_pin_failed',
      details: `exam_id=${examId}`,
      created_at: new Date().toISOString(),
    });
  } catch {
    // non-fatal — the PIN result below is what the client acts on
  }

  if (!valid) {
    return new Response(JSON.stringify({ valid: false, error: 'Incorrect PIN.' }), { status: 403 });
  }
  return new Response(JSON.stringify({ valid: true }), { status: 200 });
};
