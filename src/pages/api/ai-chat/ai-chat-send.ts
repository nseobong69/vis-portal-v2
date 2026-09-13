import type { APIRoute } from 'astro';
import { checkAuth } from '../../../lib/auth';
import { createServerSupabase } from '../../../lib/supabase';

export const prerender = false;

// Ports sendAIChat() (index.html ~29891-29948). Calls the EXISTING
// 'ai-chat' Supabase Edge Function — same "already provisioned,
// unverified only in the sense of 'still deployed under this name'"
// situation as generate-lesson-note. This one supports vision (image
// messages) and a wantsFile flag the old app uses to decide whether to
// show a Download button — the actual docx/pdf/html generation from
// that flag happens client-side (_aiGenerateDocx/_aiGeneratePdf/
// _aiGenerateHtml) and is a separate follow-up, not part of this route.
//
// Restricted to the same roles the old app's sidebar shows the button
// to: everyone EXCEPT student/parent (index.html line ~6224: "Restrict
// AI Assistant to staff only — hide for students and parents"). This
// enforces it server-side too, not just by hiding a button.
// Explicit allow-list instead of relying on an "any role" call I can't
// verify checkAuth() actually supports — safer to be explicit than to
// guess at the auth helper's signature. Omits the old app's
// 'pin_viewer'/'aptitude_guest' — those are unauthenticated guest flows
// (PIN-based result viewing, aptitude test access) that likely don't go
// through this app's cookie-based checkAuth at all; flagging rather
// than guessing they map cleanly here.
const ALLOWED_ROLES = [
  'super_admin', 'admin', 'proprietor', 'head_teacher', 'principal', 'bursar',
  'teacher', 'subject_teacher',
];

interface Body {
  messages: { role: 'user' | 'assistant'; content: any }[];
  hasVision?: boolean;
  wantsFile?: boolean;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ALLOWED_ROLES);
  if (auth.status === 'unauthenticated') {
    return new Response(JSON.stringify({ error: 'Not authenticated.' }), { status: 401 });
  }
  if (auth.status === 'unauthorized') {
    return new Response(JSON.stringify({ error: 'AI Assistant is not available for this role.' }), { status: 403 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }
  if (!Array.isArray(body.messages) || !body.messages.length) {
    return new Response(JSON.stringify({ error: 'No messages provided.' }), { status: 400 });
  }

  const supabase = createServerSupabase(cookies);
  try {
    const { data, error } = await supabase.functions.invoke('ai-chat', {
      body: { messages: body.messages.slice(-20), hasVision: !!body.hasVision, wantsFile: !!body.wantsFile },
    });
    if (error) return new Response(JSON.stringify({ error: error.message || 'AI chat failed.' }), { status: 500 });
    if (!data?.reply) return new Response(JSON.stringify({ error: 'No response from AI.' }), { status: 500 });
    return new Response(JSON.stringify({ reply: data.reply }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Could not reach the AI chat edge function.' }), { status: 500 });
  }
};
