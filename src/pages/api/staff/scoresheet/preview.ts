import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';
import { grade } from '../../../../lib/results';

export const prerender = false;

// Root cause of "Preview loads nothing": ScoreSheet.tsx was calling
// fetchScoreSheetPreview(), which used createBrowserSupabase() — a
// plain anon-key client with NO session attached. Any RLS policy
// requiring an authenticated session on `results`/`students` silently
// returns zero rows to that client (no error, just empty). This
// endpoint does the same query server-side, authenticated via the
// user's real session cookie, exactly like dashboard.astro/settings.astro
// already do correctly.
export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, [
    'super_admin', 'admin', 'proprietor', 'head_teacher', 'principal',
    'teacher', 'subject_teacher',
  ]);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  let body: { classId?: string; subjectName?: string; term?: string; session?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }
  const { classId, subjectName, term, session } = body;
  if (!classId || !subjectName || !term || !session) {
    return new Response(JSON.stringify({ error: 'classId, subjectName, term and session are required.' }), { status: 400 });
  }

  const supabase = createServerSupabase(cookies);

  const [{ data: scores, error: scoresErr }, { data: students, error: studentsErr }] = await Promise.all([
    supabase.from('results').select('*').eq('class_id', classId).eq('subject_name', subjectName).eq('term', term).eq('session', session).order('student_name'),
    supabase.from('students').select('id, full_name, admission_number').eq('class_id', classId).order('full_name'),
  ]);
  if (scoresErr) return new Response(JSON.stringify({ error: scoresErr.message }), { status: 500 });
  if (studentsErr) return new Response(JSON.stringify({ error: studentsErr.message }), { status: 500 });

  const scoreMap: Record<string, any> = {};
  (scores ?? []).forEach((r: any) => { scoreMap[r.student_id] = r; });

  const rows = (students ?? []).map((s: any, i: number) => {
    const r = scoreMap[s.id] ?? {};
    const isAb = r.is_absent || r.grade === 'AB';
    const ca = isAb ? '-' : r.ca_score != null ? String(r.ca_score) : '—';
    const exam = isAb ? '-' : r.exam_score != null ? String(r.exam_score) : '—';
    const total = isAb ? 'AB' : r.total != null ? String(r.total) : '—';
    const gradeBand = isAb
      ? { min: 0, max: 0, g: 'AB', r: 'Absent', c: '#B91C1C' }
      : r.total != null
      ? grade(r.total)
      : { min: 0, max: 0, g: '—', r: '—', c: '#999' };
    return { index: i + 1, name: s.full_name, admissionNumber: s.admission_number, ca, exam, total, gradeBand };
  });

  return new Response(JSON.stringify({ rows }), { status: 200 });
};
