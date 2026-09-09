import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';
import { fetchMyClassesWithLevel, canGenerateCombinedPDF, fetchCombinedPdfData } from '../../../../lib/combinedPdf';

export const prerender = false;

// Same allowed-role set as the "Combined PDF" row in the Feature Checklist
// (row 14: super_admin, admin, proprietor, head_teacher, principal, teacher).
const ALLOWED_ROLES = ['super_admin', 'admin', 'proprietor', 'head_teacher', 'principal', 'teacher'];

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ALLOWED_ROLES);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }

  const supabase = createServerSupabase(cookies);
  const { action } = body;

  try {
    switch (action) {
      case 'init': {
        const classes = await fetchMyClassesWithLevel(supabase, auth.role, auth.userId);
        if (auth.role === 'teacher' && !classes.length) {
          return new Response(JSON.stringify({ classes: [], noClasses: true }), { status: 200 });
        }
        return new Response(JSON.stringify({ classes }), { status: 200 });
      }

      case 'data': {
        const { classId, className, classLevel, term, session } = body;
        if (!classId) {
          return new Response(JSON.stringify({ error: 'Select a class.' }), { status: 400 });
        }
        if (!canGenerateCombinedPDF(auth.role, classLevel)) {
          return new Response(JSON.stringify({ error: 'You do not have permission for this class.' }), { status: 403 });
        }
        if (auth.role === 'teacher') {
          const { data: check } = await supabase
            .from('teacher_classes')
            .select('id')
            .eq('teacher_id', auth.userId)
            .eq('class_id', classId)
            .maybeSingle();
          if (!check) {
            return new Response(JSON.stringify({ error: 'You are not assigned to this class.' }), { status: 403 });
          }
        }
        const payload = await fetchCombinedPdfData(supabase, classId, className || '', term, session);
        if (!payload.students.length) {
          return new Response(JSON.stringify({ error: 'No students found in this class.' }), { status: 404 });
        }
        return new Response(JSON.stringify(payload), { status: 200 });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400 });
    }
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Server error.' }), { status: 500 });
  }
};
