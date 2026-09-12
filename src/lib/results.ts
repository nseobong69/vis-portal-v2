import { createBrowserSupabase } from './supabase';

// Ported 1:1 from the old app's renderResults()/loadSheet()/saveSheet()/
// calcPos()/showBlockResultModal() (Feature Checklist row 10: Results /
// Enter Scores). Grade scale, absent-marker convention ("-" in both CA
// and Exam), and the tie-aware position ranking are all load-bearing —
// they must match the old app exactly so report cards/score sheets
// produce identical numbers.

export interface ClassOption {
  id: string;
  name: string;
  arm: string | null;
}

export interface SubjectOption {
  id: string;
  name: string;
}

export interface GradeBand {
  min: number;
  max: number;
  g: string;
  r: string;
  c: string;
}

// GS — identical bands/colors to the old app's const GS.
export const GRADE_SCALE: GradeBand[] = [
  { min: 80, max: 100, g: 'A', r: 'Excellent', c: '#1D4ED8' },
  { min: 70, max: 79, g: 'B+', r: 'Very Good', c: '#047857' },
  { min: 60, max: 69, g: 'B', r: 'Good', c: '#15803D' },
  { min: 50, max: 59, g: 'C', r: 'Pass', c: '#15803D' },
  { min: 45, max: 49, g: 'D', r: 'Fair', c: '#B45309' },
  { min: 40, max: 44, g: 'E', r: 'Poor', c: '#C2410C' },
  { min: 0, max: 39, g: 'F', r: 'Fail', c: '#B91C1C' },
];

/** Mirrors grade(s) — resolves a numeric total to its grade band. */
export function grade(total: number | string): GradeBand {
  const v = typeof total === 'string' ? parseFloat(total) : total;
  if (isNaN(v)) return { min: 0, max: 0, g: '—', r: '—', c: '#999' };
  return GRADE_SCALE.find((x) => v >= x.min && v <= x.max) ?? GRADE_SCALE[GRADE_SCALE.length - 1];
}

/** Mirrors isAbsentEntry(ca,ex) — a student is Absent when BOTH fields are literally "-". */
export function isAbsentEntry(ca: string, ex: string): boolean {
  return ca.trim() === '-' && ex.trim() === '-';
}

export interface StudentRow {
  id: string;
  full_name: string;
  admission_number: string;
}

export interface ExistingResult {
  student_id: string;
  ca_score: number | null;
  exam_score: number | null;
  total: number | null;
  grade: string | null;
  remark: string | null;
  is_absent: boolean | null;
}

export interface SheetRow {
  student_id: string;
  admission_number: string;
  student_name: string;
  ca: string; // '' | '-' | numeric string, mirrors the <input> value
  em: string;
}

/** Mirrors getMyClasses() role-scoping. Called with the caller's resolved role + userId. */
export async function fetchMyClasses(role: string, userId: string): Promise<ClassOption[]> {
  const supabase = createBrowserSupabase();

  if (role === 'teacher') {
    const [{ data: tc }, { data: ts }] = await Promise.all([
      supabase.from('teacher_classes').select('class_id, classes(id, name, arm)').eq('teacher_id', userId),
      supabase.from('teacher_subjects').select('class_id, classes(id, name, arm)').eq('teacher_id', userId),
    ]);
    const seen = new Set<string>();
    const all: ClassOption[] = [];
    [...(tc ?? []), ...(ts ?? [])].forEach((r: any) => {
      const c = r.classes;
      if (c && !seen.has(c.id)) {
        seen.add(c.id);
        all.push(c);
      }
    });
    return all;
  }

  if (role === 'subject_teacher') {
    const { data: ts } = await supabase
      .from('teacher_subjects')
      .select('class_id, classes(id, name, arm)')
      .eq('teacher_id', userId);
    const seen = new Set<string>();
    return (ts ?? [])
      .map((r: any) => r.classes)
      .filter((c: any) => {
        if (!c || seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });
  }

  if (role === 'head_teacher') {
    const { data } = await supabase
      .from('classes')
      .select('id, name, arm, level')
      .in('level', ['kindergarten', 'nursery', 'primary'])
      .order('name');
    return data ?? [];
  }

  if (role === 'principal') {
    const { data } = await supabase.from('classes').select('id, name, arm, level').eq('level', 'secondary').order('name');
    return data ?? [];
  }

  const { data } = await supabase.from('classes').select('id, name, arm').order('name');
  return data ?? [];
}

/** Mirrors the subject list + Fix 3's subject_teacher filter by teacher_subjects. */
export async function fetchSubjectsFor(role: string, userId: string): Promise<SubjectOption[]> {
  const supabase = createBrowserSupabase();
  const { data: allSubjects } = await supabase.from('subjects').select('id, name').order('name');
  let subjects = allSubjects ?? [];

  if (role === 'subject_teacher') {
    const { data: ts } = await supabase.from('teacher_subjects').select('subject_id').eq('teacher_id', userId);
    const assignedIds = new Set((ts ?? []).map((r) => r.subject_id).filter(Boolean));
    subjects = subjects.filter((s) => assignedIds.has(s.id));
  }

  return subjects;
}

/**
 * Mirrors loadSheet()'s SECURITY check: a `teacher` has full access if they
 * are the class teacher for `classId`; otherwise they must be specifically
 * assigned this subject in this class via teacher_subjects. A
 * `subject_teacher` must always be assigned both class AND subject.
 * Returns null when allowed, or an error message when not.
 */
export async function checkSheetAccess(
  role: string,
  userId: string,
  classId: string,
  subjectId: string
): Promise<string | null> {
  const supabase = createBrowserSupabase();

  if (role === 'teacher') {
    const { data: classAssign } = await supabase
      .from('teacher_classes')
      .select('id')
      .eq('teacher_id', userId)
      .eq('class_id', classId)
      .maybeSingle();
    if (classAssign) return null; // class teacher: full access to all subjects

    const { data: subjectAssign } = await supabase
      .from('teacher_subjects')
      .select('id')
      .eq('teacher_id', userId)
      .eq('subject_id', subjectId)
      .eq('class_id', classId)
      .maybeSingle();
    if (!subjectAssign) return 'You are not assigned to teach this subject in this class.';
    return null;
  }

  if (role === 'subject_teacher') {
    const { data: chk } = await supabase
      .from('teacher_subjects')
      .select('id')
      .eq('teacher_id', userId)
      .eq('subject_id', subjectId)
      .eq('class_id', classId)
      .maybeSingle();
    if (!chk) return 'You are not assigned to teach this subject in this class.';
    return null;
  }

  // Admin-tier roles: no further restriction (matches old app — only
  // teacher/subject_teacher get the extra check in loadSheet()).
  return null;
}

/** Mirrors the students+existing-results fetch inside loadSheet(). */
export async function fetchSheetData(
  classId: string,
  subjectId: string,
  term: string,
  session: string
): Promise<{ students: StudentRow[]; existing: Record<string, ExistingResult> }> {
  const supabase = createBrowserSupabase();
  const [{ data: students }, { data: existing }] = await Promise.all([
    supabase.from('students').select('id, full_name, admission_number').eq('class_id', classId).order('full_name'),
    supabase.from('results').select('*').eq('class_id', classId).eq('subject_id', subjectId).eq('term', term).eq('session', session),
  ]);
  const exMap: Record<string, ExistingResult> = {};
  (existing ?? []).forEach((r: ExistingResult) => {
    exMap[r.student_id] = r;
  });
  return { students: students ?? [], existing: exMap };
}

/**
 * Mirrors saveSheet(): builds upsert rows (AB rows get null scores),
 * then updates existing rows by id / inserts the rest — same
 * update-then-insert split as the old app (not a single upsert call),
 * matched here so behavior on partial failure is identical.
 */
export async function saveSheet(
  rows: SheetRow[],
  classId: string,
  className: string,
  subjectId: string,
  subjectName: string,
  term: string,
  session: string
): Promise<{ ok: boolean; saved: number; error?: string }> {
  const supabase = createBrowserSupabase();

  const ups = rows
    .map((row) => {
      const caRaw = row.ca.trim();
      const emRaw = row.em.trim();

      if (isAbsentEntry(caRaw, emRaw)) {
        return {
          student_id: row.student_id,
          admission_number: row.admission_number,
          student_name: row.student_name,
          class_id: classId,
          class_name: className,
          subject_id: subjectId,
          subject_name: subjectName,
          term,
          session,
          ca_score: null,
          exam_score: null,
          total: null,
          grade: 'AB',
          remark: 'Absent',
          is_absent: true,
        };
      }

      const ca = parseFloat(caRaw);
      const em = parseFloat(emRaw);
      if (isNaN(ca) || isNaN(em)) return null;
      const tot = parseFloat((ca + em).toFixed(2));
      const gd = grade(tot);
      return {
        student_id: row.student_id,
        admission_number: row.admission_number,
        student_name: row.student_name,
        class_id: classId,
        class_name: className,
        subject_id: subjectId,
        subject_name: subjectName,
        term,
        session,
        ca_score: ca,
        exam_score: em,
        total: tot,
        grade: gd.g,
        remark: gd.r,
        is_absent: false,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (!ups.length) return { ok: false, saved: 0, error: 'No data.' };

  const { data: existing } = await supabase
    .from('results')
    .select('id, student_id')
    .eq('class_id', classId)
    .eq('subject_name', subjectName)
    .eq('term', term)
    .eq('session', session);

  const idMap: Record<string, string> = {};
  (existing ?? []).forEach((r: { id: string; student_id: string }) => {
    idMap[r.student_id] = r.id;
  });

  const toUpdate = ups.filter((r) => idMap[r.student_id]);
  const toInsert = ups.filter((r) => !idMap[r.student_id]);

  let saved = 0;
  const errs: string[] = [];

  await Promise.all(
    toUpdate.map(async (r) => {
      const { error } = await supabase
        .from('results')
        .update({
          ca_score: r.ca_score,
          exam_score: r.exam_score,
          total: r.total,
          grade: r.grade,
          remark: r.remark,
          is_absent: r.is_absent || false,
        })
        .eq('id', idMap[r.student_id]);
      if (error) errs.push(error.message);
      else saved++;
    })
  );

  if (toInsert.length) {
    const { error } = await supabase.from('results').insert(toInsert);
    if (error) errs.push(error.message);
    else saved += toInsert.length;
  }

  if (errs.length) return { ok: false, saved, error: errs[0] };
  return { ok: true, saved };
}

/**
 * Mirrors calcPos(): tie-aware ranking by grand total across all
 * subjects for the term. Students whose grand total is 0 get position
 * null (not ranked) — same as the old app.
 */
export async function calcPositions(
  classId: string,
  term: string,
  session: string
): Promise<{ ok: boolean; count: number; error?: string }> {
  const supabase = createBrowserSupabase();
  const { data } = await supabase.from('results').select('student_id, total').eq('class_id', classId).eq('term', term).eq('session', session);

  if (!data?.length) return { ok: false, count: 0, error: 'No results to rank.' };

  const totals: Record<string, number> = {};
  data.forEach((r: { student_id: string; total: number | null }) => {
    totals[r.student_id] = (totals[r.student_id] ?? 0) + (parseFloat(String(r.total)) || 0);
  });

  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);

  let rank = 1;
  let placed = 0;

  for (let i = 0; i < sorted.length; i++) {
    const [sid, tot] = sorted[i];
    if (tot === 0) {
      await supabase.from('results').update({ position: null }).eq('student_id', sid).eq('term', term).eq('session', session);
      continue;
    }
    placed++;
    if (placed === 1 || tot !== sorted[i - 1]?.[1]) {
      rank = placed;
    }
    await supabase.from('results').update({ position: rank }).eq('student_id', sid).eq('term', term).eq('session', session);
  }

  return { ok: true, count: sorted.length };
}

// ── Result blocking (showBlockResultModal / applyResultBlocks) ──

export const DEFAULT_BLOCK_MESSAGE =
  'Your result for this term is unavailable because you are indebted to school. Visit the school premises or call us to clear your debt. And your result will be available.';

export interface BlockRow {
  student_id: string;
  blocked: boolean;
  message: string;
}

export async function fetchBlockList(
  classId: string,
  term: string,
  session: string
): Promise<{ students: StudentRow[]; blocks: Record<string, { blocked: boolean; message: string }> }> {
  const supabase = createBrowserSupabase();
  const { data: students } = await supabase.from('students').select('id, full_name, admission_number').eq('class_id', classId).order('full_name');
  const ids = (students ?? []).map((s) => s.id);
  const { data: existing } = await supabase
    .from('result_block_messages')
    .select('*')
    .eq('term', term)
    .eq('session', session)
    .in('student_id', ids.length ? ids : ['__none__']);

  const blockMap: Record<string, { blocked: boolean; message: string }> = {};
  (existing ?? []).forEach((r: { student_id: string; blocked: boolean; message: string }) => {
    blockMap[r.student_id] = { blocked: r.blocked, message: r.message };
  });

  return { students: students ?? [], blocks: blockMap };
}

/** Mirrors applyResultBlocks() — upsert on (student_id, term, session). */
export async function applyResultBlocks(
  records: BlockRow[],
  term: string,
  session: string,
  blockedBy: string
): Promise<{ ok: boolean; count: number; error?: string }> {
  if (!records.length) return { ok: false, count: 0, error: 'No students found.' };
  const supabase = createBrowserSupabase();
  const payload = records.map((r) => ({
    student_id: r.student_id,
    term,
    session,
    blocked: r.blocked,
    message: r.message,
    blocked_by: blockedBy,
    blocked_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('result_block_messages').upsert(payload, { onConflict: 'student_id,term,session' });
  if (error) return { ok: false, count: 0, error: error.message };
  return { ok: true, count: records.length };
}

// ── Monitor Scores (renderMonitorScores/loadMonitorScores — cross-class,
// read-only oversight view). Visible to: super_admin, admin, proprietor
// (all classes) · principal (secondary only) · head_teacher (kindergarten/
// nursery/primary only) — class scope is enforced by fetchMyClasses(),
// same as Results. NOT visible to teacher/subject_teacher — matches the
// old app's role comment on renderMonitorScores().

export interface MonitorScoreRow {
  student_name: string;
  class_name: string;
  subject_name: string;
  ca_score: number | null;
  exam_score: number | null;
  total: number | null;
  grade: string | null;
  is_absent: boolean | null;
}

export interface MonitorSummaryRow {
  cname: string;
  subj: string;
  total: number;
  entered: number;
}

/**
 * Mirrors loadMonitorScores(): fetches results.* directly (student_name/
 * subject_name/class_name are plain text columns on the row already —
 * no join needed), groups by class+subject for the summary table, and
 * returns the raw score rows for the detail table.
 */
export async function fetchMonitorScores(
  classIds: string[],
  term: string,
  session: string,
  subjectName: string, // '' means all subjects
  classesInScope: ClassOption[]
): Promise<{
  summaryRows: MonitorSummaryRow[];
  detailRows: MonitorScoreRow[];
  totalEntered: number;
  classesWithData: number;
}> {
  const supabase = createBrowserSupabase();

  if (!classIds.length) {
    return { summaryRows: [], detailRows: [], totalEntered: 0, classesWithData: 0 };
  }

  let query = supabase.from('results').select('*').in('class_id', classIds).eq('term', term).eq('session', session);
  if (subjectName) query = query.eq('subject_name', subjectName);

  const [{ data: scores }, { data: students }] = await Promise.all([
    query,
    supabase.from('students').select('id, class_id').in('class_id', classIds),
  ]);

  const scoreRows = (scores ?? []) as (MonitorScoreRow & { class_id: string })[];

  const stuCountByClass: Record<string, number> = {};
  (students ?? []).forEach((s: { class_id: string }) => {
    stuCountByClass[s.class_id] = (stuCountByClass[s.class_id] ?? 0) + 1;
  });

  // group by class, then subject within class — matches old app's byClassSubj,
  // so "entered" per subject isn't inflated when "All Subjects" is selected.
  const byClassSubj: Record<string, typeof scoreRows> = {};
  scoreRows.forEach((r) => {
    const k = r.class_id + '|' + (r.subject_name || '—');
    (byClassSubj[k] = byClassSubj[k] ?? []).push(r);
  });

  const summaryRows: MonitorSummaryRow[] = [];
  classesInScope.forEach((c) => {
    const total = stuCountByClass[c.id] ?? 0;
    const cname = `${c.name ?? ''}${c.arm ? ' ' + c.arm : ''}`.trim();
    const subjNames = subjectName
      ? [subjectName]
      : [...new Set(scoreRows.filter((r) => r.class_id === c.id).map((r) => r.subject_name))];

    if (subjNames.length === 0) {
      // Nothing entered for this class & no specific class filter — skip,
      // same as the old app (unless caller narrowed to one class already,
      // which the page layer handles by passing a single-item classIds).
      if (classIds.length > 1) return;
      summaryRows.push({ cname, subj: subjectName || '—', total, entered: 0 });
      return;
    }

    subjNames.forEach((sn) => {
      const entered = (byClassSubj[c.id + '|' + sn] ?? []).length;
      summaryRows.push({ cname, subj: sn, total, entered });
    });
  });

  const totalEntered = scoreRows.length;
  const classesWithData = new Set(scoreRows.map((r) => r.class_id)).size;

  return { summaryRows, detailRows: scoreRows, totalEntered, classesWithData };
}
