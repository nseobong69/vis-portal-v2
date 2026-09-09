import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';
import {
  fetchMyClasses,
  fetchSubjectsFor,
  checkSheetAccess,
  fetchSheetData,
  saveSheet,
  calcPositions,
  fetchBlockList,
  applyResultBlocks,
} from '../../../../lib/results';

export const prerender = false;

// One endpoint, dispatched by `action`, covering every operation
// ResultsSheet.tsx needs. Each of these used to call
// createBrowserSupabase() directly from the browser — an anonymous
// client with no session — so under RLS every read came back empty and
// every write silently failed. All of it now runs here, server-side,
// authenticated with the real session cookie via createServerSupabase,
// exactly like dashboard.astro/settings.astro already do correctly.
export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, [
    'super_admin', 'admin', 'proprietor', 'head_teacher', 'principal',
    'teacher', 'subject_teacher',
  ]);
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
        const [classes, subjects] = await Promise.all([
          fetchMyClasses(supabase, auth.role, auth.userId),
          fetchSubjectsFor(supabase, auth.role, auth.userId),
        ]);
        return new Response(JSON.stringify({ classes, subjects }), { status: 200 });
      }

      case 'load': {
        const { classId, subjectId, term, session } = body;
        const accessErr = await checkSheetAccess(supabase, auth.role, auth.userId, classId, subjectId);
        if (accessErr) return new Response(JSON.stringify({ error: accessErr }), { status: 403 });
        const data = await fetchSheetData(supabase, classId, subjectId, term, session);
        return new Response(JSON.stringify(data), { status: 200 });
      }

      case 'save': {
        const { rows, classId, className, subjectId, subjectName, term, session } = body;
        const result = await saveSheet(supabase, rows, classId, className, subjectId, subjectName, term, session);
        return new Response(JSON.stringify(result), { status: result.ok ? 200 : 400 });
      }

      case 'calcPositions': {
        const { classId, term, session } = body;
        const result = await calcPositions(supabase, classId, term, session);
        return new Response(JSON.stringify(result), { status: result.ok ? 200 : 400 });
      }

      case 'fetchBlockList': {
        const { classId, term, session } = body;
        const data = await fetchBlockList(supabase, classId, term, session);
        return new Response(JSON.stringify(data), { status: 200 });
      }

      case 'applyResultBlocks': {
        const { records, term, session } = body;
        const result = await applyResultBlocks(supabase, records, term, session, auth.userId);
        return new Response(JSON.stringify(result), { status: result.ok ? 200 : 400 });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400 });
    }
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Server error.' }), { status: 500 });
  }
};
