import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

// Ports generateAILessonNote() (index.html ~30394-30428). This calls an
// EXISTING Supabase Edge Function, 'generate-lesson-note' — the old
// app's modal footer says "Powered by Groq · Free · Instant", so the
// Groq API key (or whatever it needs) is already provisioned as a
// Supabase secret, not something this route configures.
//
// UNVERIFIED: I have not confirmed this edge function is still deployed
// under this name in your current Supabase project — I only know it
// existed for the old app. If it's missing/renamed, this returns
// whatever error Supabase gives for an unknown function, not a silent
// failure — check the response if "AI Generate" doesn't work.
const ACAD_ROLES = ['super_admin', 'admin', 'head_teacher', 'principal', 'proprietor', 'teacher', 'subject_teacher'];

interface Body {
  subject: string; class_name: string; topic: string; duration?: string;
  sex?: string; date?: string; term?: string; session?: string;
  objectives?: string; extra?: string;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ACAD_ROLES);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }
  if (!body.subject?.trim() || !body.class_name?.trim() || !body.topic?.trim()) {
    return new Response(JSON.stringify({ error: 'Subject, Class and Topic are required.' }), { status: 400 });
  }

  const supabase = createServerSupabase(cookies);

  try {
    const { data, error } = await supabase.functions.invoke('generate-lesson-note', {
      body: {
        subject: body.subject.trim(),
        class_name: body.class_name.trim(),
        topic: body.topic.trim(),
        duration: body.duration?.trim() || '40 minutes',
        sex: body.sex || 'Mixed',
        date: body.date || '',
        term: body.term || '1st Term',
        session: body.session?.trim() || '2024/2025',
        objectives: body.objectives?.trim() || '',
        extra: body.extra?.trim() || '',
      },
    });
    if (error) return new Response(JSON.stringify({ error: error.message || 'AI generation failed.' }), { status: 500 });
    if (!data?.note) return new Response(JSON.stringify({ error: 'No response from AI generator.' }), { status: 500 });
    return new Response(JSON.stringify({ note: data.note }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Could not reach the AI generator edge function.' }), { status: 500 });
  }
};
