import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

// Same role list email-center.astro itself already gates on
// (confirmed from that file's ALLOWED_ROLES) — kept in sync rather than
// invented fresh, since this route only ever gets called from pages
// already behind that same gate.
const ALLOWED_ROLES = ['super_admin', 'admin', 'proprietor', 'head_teacher', 'principal'];

// GET, not POST — this only ever reads school_settings, nothing is
// mutated. Returns the EmailJS PUBLIC key (the clue is in the name —
// it's meant to be visible to an authorized browser session) plus the
// service/template ids, none of which are secrets on their own; the
// actual EmailJS account secret never leaves EmailJS's own dashboard.
export const GET: APIRoute = async ({ cookies }) => {
  const auth = await checkAuth(cookies, ALLOWED_ROLES);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  const supabase = createServerSupabase(cookies);
  const { data, error } = await supabase
    .from('school_settings')
    .select('emailjs_service_id, emailjs_template_id, emailjs_public_key, reply_email, school_name')
    .eq('id', 1)
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  return new Response(
    JSON.stringify({
      service_id: data?.emailjs_service_id || null,
      template_id: data?.emailjs_template_id || null,
      public_key: data?.emailjs_public_key || null,
      reply_email: data?.reply_email || null,
      school_name: data?.school_name || null,
    }),
    { status: 200 }
  );
};
