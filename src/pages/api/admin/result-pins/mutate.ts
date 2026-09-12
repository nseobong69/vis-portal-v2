import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

// Same role list as canAccessResultPins() gates the whole Pins screen
// with in the old app.
const ALLOWED = ['super_admin', 'admin', 'proprietor', 'head_teacher', 'principal'];

interface StudentLite { id: string; full_name?: string; admission_number?: string | null }
interface Ctx { cid: string; className: string; term: string; sess: string }
interface PinEntry { pin: string; isOverride: boolean }

interface Body {
  ctx: Ctx;
  students: StudentLite[];
  pins: Record<string, PinEntry>; // student_id -> { pin, isOverride }
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ALLOWED);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }

  const { ctx, students, pins } = body;
  if (!ctx?.cid) return new Response(JSON.stringify({ error: 'Missing class context.' }), { status: 400 });
  if (!students?.length) return new Response(JSON.stringify({ error: 'No students given.' }), { status: 400 });

  const supabase = createServerSupabase(cookies);

  // Same upsert shape and onConflict target as rpGenerateOne()/
  // rpGenerateSelected()/rpSaveOverride() (index.html ~L24393-24456) —
  // one row per (student_id, term, session). The PIN itself is
  // generated client-side (rpFullPin/rpGenSuffix, same pure functions
  // the old app ran in-browser) and just written here.
  const records = students.map((s) => {
    const entry = pins[s.id];
    return {
      student_id: s.id,
      student_name: s.full_name || '',
      admission_number: s.admission_number || null,
      class_id: ctx.cid,
      class_name: ctx.className,
      term: ctx.term,
      session: ctx.sess,
      pin: entry?.pin || '',
      is_override: !!entry?.isOverride,
      created_by: auth.userId,
      created_at: new Date().toISOString(),
    };
  });

  if (records.some((r) => !r.pin)) {
    return new Response(JSON.stringify({ error: 'Missing pin for one or more students.' }), { status: 400 });
  }

  const { error } = await supabase
    .from('result_pins_v2')
    .upsert(records, { onConflict: 'student_id,term,session' });

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
