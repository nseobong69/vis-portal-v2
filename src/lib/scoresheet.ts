import { createBrowserSupabase } from './supabase';
import { grade, type GradeBand } from './results';

// Ported from the old app's renderScoreSheet()/loadScoreSheetPreview()
// (single-subject sheet) and renderMarkSheet()/loadMarkSheetPreview()
// (class-teacher's cross-subject grid) — Feature Checklist REPORTS
// group. PDF building itself (_buildScoreSheetPDF /
// _renderMarkSheetPDF) is intentionally NOT ported 1:1 — see the
// README note in the output doc for why.

export interface ClassOption {
  id: string;
  name: string;
  arm: string | null;
}

export interface SubjectOption {
  id: string;
  name: string;
}

/** Mirrors renderScoreSheet()'s subject list: subject_teacher sees only assigned subjects. */
export async function fetchScoreSheetSubjects(role: string, userId: string): Promise<SubjectOption[]> {
  const supabase = createBrowserSupabase();
  if (role === 'subject_teacher') {
    const { data } = await supabase.from('teacher_subjects').select('subject_id, subjects(id, name)').eq('teacher_id', userId);
    return (data ?? []).map((r: any) => r.subjects).filter(Boolean);
  }
  const { data } = await supabase.from('subjects').select('id, name').order('name');
  return data ?? [];
}

export interface ScoreSheetRow {
  index: number;
  name: string;
  admissionNumber: string;
  ca: string;
  exam: string;
  total: string;
  gradeBand: GradeBand;
}

/** Mirrors loadScoreSheetPreview()'s scoreMap join + row shaping. */
export async function fetchScoreSheetPreview(
  classId: string,
  subjectName: string,
  term: string,
  session: string
): Promise<ScoreSheetRow[]> {
  const supabase = createBrowserSupabase();
  const [{ data: scores }, { data: students }] = await Promise.all([
    supabase.from('results').select('*').eq('class_id', classId).eq('subject_name', subjectName).eq('term', term).eq('session', session).order('student_name'),
    supabase.from('students').select('id, full_name, admission_number').eq('class_id', classId).order('full_name'),
  ]);
  const scoreMap: Record<string, any> = {};
  (scores ?? []).forEach((r: any) => {
    scoreMap[r.student_id] = r;
  });
  return (students ?? []).map((s, i) => {
    const r = scoreMap[s.id] ?? {};
    const isAb = r.is_absent || r.grade === 'AB';
    const ca = isAb ? '-' : r.ca_score != null ? String(r.ca_score) : '—';
    const exam = isAb ? '-' : r.exam_score != null ? String(r.exam_score) : '—';
    const total = isAb ? 'AB' : r.total != null ? String(r.total) : '—';
    const gradeBand = isAb ? { min: 0, max: 0, g: 'AB', r: 'Absent', c: '#B91C1C' } : r.total != null ? grade(r.total) : { min: 0, max: 0, g: '—', r: '—', c: '#999' };
    return { index: i + 1, name: s.full_name, admissionNumber: s.admission_number, ca, exam, total, gradeBand };
  });
}

// ── Mark Sheet (class-teacher cross-subject grid) ──

export interface MarkSheetStudentRow {
  id: string;
  full_name: string;
  admission_number: string;
  subs: (SubjectResultCell | null)[]; // one per `subjects`, null = student doesn't take it
  totalObt: number;
  totalPoss: number;
  avg: number;
  position: number;
}

export interface SubjectResultCell {
  total: number | null;
  is_absent: boolean;
  grade: string | null;
}

export interface MarkSheetData {
  subjects: string[];
  rows: MarkSheetStudentRow[];
  hasNoScores: boolean;
}

/** Mirrors loadMarkSheetPreview(): builds the subject set, per-student totals/avg, and tie-aware position ranking. */
export async function fetchMarkSheetData(classId: string, term: string, session: string): Promise<MarkSheetData> {
  const supabase = createBrowserSupabase();
  const [{ data: students }, { data: results }] = await Promise.all([
    supabase.from('students').select('id, full_name, admission_number').eq('class_id', classId).order('full_name'),
    supabase.from('results').select('*').eq('class_id', classId).eq('term', term).eq('session', session),
  ]);

  if (!students?.length) return { subjects: [], rows: [], hasNoScores: true };

  const subjSet = new Set((results ?? []).map((r: any) => r.subject_name).filter(Boolean));
  const subjects = [...subjSet].sort() as string[];
  const rMap: Record<string, any> = {};
  (results ?? []).forEach((r: any) => {
    rMap[`${r.student_id}|${r.subject_name}`] = r;
  });

  const sData: MarkSheetStudentRow[] = students.map((s) => {
    // Only subjects this student has an actual result row for count toward
    // their total/average — a subject with no row means they don't offer
    // it (science vs. commercial vs. humanities sharing one class), and
    // must NOT be dragged in as a 0. Same rule as the old app.
    const subs = subjects.map((sub) => {
      const r = rMap[`${s.id}|${sub}`];
      if (!r) return null;
      return { total: r.total != null ? parseFloat(r.total) : null, is_absent: !!r.is_absent, grade: r.grade ?? null };
    });
    const taken = subs.filter((c): c is SubjectResultCell => c !== null);
    const totalObt = taken.reduce((a, b) => a + (b.total ?? 0), 0);
    const totalPoss = taken.length * 100;
    const avg = totalPoss > 0 ? parseFloat(((totalObt / totalPoss) * 100).toFixed(2)) : 0;
    return { id: s.id, full_name: s.full_name, admission_number: s.admission_number, subs, totalObt, totalPoss, avg, position: 0 };
  });

  sData.sort((a, b) => b.avg - a.avg);

  // Tie-aware ranking: identical to calcPos()'s pattern — a tie repeats
  // the previous position, and the position after a tied group skips
  // ahead by the group size (implemented here via the same running
  // `pos = i + 2` mirrored from the old app, not re-derived).
  let pos = 1;
  for (let i = 0; i < sData.length; i++) {
    if (i > 0 && sData[i].avg === sData[i - 1].avg) sData[i].position = sData[i - 1].position;
    else sData[i].position = pos;
    pos = i + 2;
  }

  return { subjects, rows: sData, hasNoScores: subjects.length === 0 };
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Looks up the signed-in staff member's display name for PDF headers/footers (mirrors UP?.full_name). */
export async function fetchStaffName(userId: string): Promise<string> {
  const supabase = createBrowserSupabase();
  const { data } = await supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle();
  return data?.full_name ?? '—';
}
