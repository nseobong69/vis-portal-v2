import { createBrowserSupabase } from './supabase';
import { grade, isAbsentEntry, type GradeBand } from './results';

// Ported from the old app's renderClassHub() + the 20 hub*() functions that
// back its 11 tabs (Feature Checklist row 2: Class Hub). Class Hub is the
// single "everything about this class" screen for class teachers and
// admin-tier roles — it re-scopes several already-ported screens (Enter
// Scores, Score Sheet, Mark Sheet, Attendance, Result Pins) to one selected
// class, plus five tabs that are new here: Students roster, Subject
// Registration, CBT list, Affective Traits, Publish Result, and Clearance.
//
// PDF building (printClassStudentListPDF, hubDownloadSubjRegPDF) is
// intentionally NOT ported 1:1 here, same call as scoresheet.ts's header
// comment — it's a UI/rendering concern for the component layer, not this
// data module, and the jsPDF byte-for-byte layout is low value to freeze
// before the fonts/branding assets are confirmed in the new app.

export type Role =
  | 'super_admin' | 'admin' | 'proprietor' | 'head_teacher' | 'principal'
  | 'teacher' | 'subject_teacher' | 'bursar' | 'student' | 'parent'
  | 'pin_viewer' | 'aptitude_guest';

// Class Hub is for class teachers and admin-like roles only. A
// subject_teacher who is NOT also a class teacher has no class to manage
// here — they use the dedicated Enter Scores / Score Sheet pages instead.
export const HUB_ALLOWED: Role[] = [
  'super_admin', 'admin', 'head_teacher', 'principal', 'proprietor', 'teacher',
];

export interface HubTab {
  key: string;
  icon: string;
  label: string;
  roles: Role[];
}

// Order matters — mirrors HUB_TABS / the `loaders` array index mapping.
export const HUB_TABS: HubTab[] = [
  { key: 'students', icon: 'users', label: 'Students', roles: ['super_admin', 'admin', 'head_teacher', 'principal', 'proprietor', 'teacher'] },
  { key: 'attendance', icon: 'calendar-check', label: 'Attendance', roles: ['super_admin', 'admin', 'head_teacher', 'principal', 'proprietor', 'teacher'] },
  { key: 'subject-reg', icon: 'clipboard-list', label: 'Subject Reg', roles: ['super_admin', 'admin', 'head_teacher', 'principal', 'proprietor', 'teacher'] },
  { key: 'cbt', icon: 'laptop', label: 'CBT', roles: ['super_admin', 'admin', 'head_teacher', 'principal', 'proprietor', 'teacher'] },
  { key: 'enter-scores', icon: 'pen-to-square', label: 'Enter Scores', roles: ['super_admin', 'admin', 'head_teacher', 'principal', 'proprietor', 'teacher'] },
  { key: 'score-sheet', icon: 'file-pdf', label: 'Score Sheet', roles: ['super_admin', 'admin', 'head_teacher', 'principal', 'proprietor', 'teacher'] },
  { key: 'mark-sheet', icon: 'table', label: 'Mark Sheet', roles: ['super_admin', 'admin', 'head_teacher', 'principal', 'proprietor', 'teacher'] },
  { key: 'affective-traits', icon: 'star', label: 'Affective Traits', roles: ['super_admin', 'admin', 'head_teacher', 'principal', 'proprietor', 'teacher'] },
  { key: 'publish-result', icon: 'eye', label: 'Publish Result', roles: ['super_admin', 'admin', 'head_teacher', 'principal', 'proprietor', 'teacher'] },
  { key: 'pins', icon: 'key', label: 'Pins', roles: ['super_admin', 'admin', 'head_teacher', 'principal', 'proprietor'] },
  { key: 'clearance', icon: 'user-check', label: 'Clearance', roles: ['super_admin', 'admin', 'head_teacher', 'principal', 'proprietor', 'bursar'] },
];

export interface ClassOption {
  id: string;
  name: string;
  arm: string | null;
  level?: string;
}

/**
 * Mirrors getMyHubClasses(): Class Hub must show ONLY classes where the
 * user is the actual class teacher — never classes where they're merely a
 * subject teacher. Subject-teacher-only class access belongs exclusively
 * in Enter Scores (fetchMyClasses in results.ts), not here.
 */
export async function fetchMyHubClasses(role: Role, userId: string): Promise<ClassOption[]> {
  const supabase = createBrowserSupabase();

  if (role === 'teacher') {
    const { data: tc } = await supabase
      .from('teacher_classes')
      .select('class_id, classes(id, name, arm, level)')
      .eq('teacher_id', userId);
    const seen = new Set<string>();
    const out: ClassOption[] = [];
    (tc ?? []).forEach((r: any) => {
      const c = r.classes;
      if (c && !seen.has(c.id)) {
        seen.add(c.id);
        out.push(c);
      }
    });
    return out;
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
    const { data } = await supabase
      .from('classes').select('id, name, arm, level').eq('level', 'secondary').order('name');
    return data ?? [];
  }

  // super_admin / admin / proprietor: all classes.
  const { data } = await supabase.from('classes').select('id, name, arm, level').order('name');
  return data ?? [];
}

/** Mirrors the auto-select-teacher's-class logic in renderClassHub(). */
export async function fetchAutoSelectClassId(role: Role, userId: string): Promise<string | null> {
  if (role !== 'teacher') return null;
  const supabase = createBrowserSupabase();
  const { data: tc } = await supabase
    .from('teacher_classes').select('class_id').eq('teacher_id', userId).limit(1);
  return tc?.[0]?.class_id ?? null;
}

// ── Tab 0: Students ──────────────────────────────────────────────────────

export interface HubStudent {
  id: string;
  full_name: string;
  admission_number: string | null;
  gender: string | null;
  parent_name: string | null;
  blocked: boolean | null;
  has_account: boolean | null;
}

/** Mirrors hubStudents()'s query — full roster for the selected class. */
export async function fetchHubStudents(classId: string): Promise<HubStudent[]> {
  const supabase = createBrowserSupabase();
  const { data } = await supabase.from('students').select('*').eq('class_id', classId).order('full_name');
  return data ?? [];
}

/** Mirrors toggleBlock() called from the Students tab. */
export async function toggleStudentBlock(studentId: string, blocked: boolean): Promise<string | null> {
  const supabase = createBrowserSupabase();
  const { error } = await supabase.from('students').update({ blocked }).eq('id', studentId);
  return error?.message ?? null;
}

// ── Tab 2: Subject Registration ──────────────────────────────────────────

export interface SubjectOption {
  id: string;
  name: string;
  code?: string | null;
}

export interface SubjectRegRow {
  student_id: string;
  student_name: string;
  admission_number: string | null;
  subject_names: string[];
}

/** Mirrors hubSubjectReg()'s three parallel fetches + byStudent grouping. */
export async function fetchSubjectRegData(
  classId: string,
  term: string,
  session: string
): Promise<{ subjects: SubjectOption[]; students: HubStudent[]; registered: SubjectRegRow[] }> {
  const supabase = createBrowserSupabase();
  const [{ data: classSubs }, { data: regs }, { data: students }] = await Promise.all([
    supabase.from('class_subjects').select('subject_id, subjects(id, name, code)').eq('class_id', classId),
    supabase.from('subject_registrations').select('*').eq('class_id', classId).eq('session', session).eq('term', term),
    supabase.from('students').select('id, full_name, admission_number').eq('class_id', classId).order('full_name'),
  ]);

  const subjects = (classSubs ?? []).map((cs: any) => cs.subjects).filter(Boolean);

  const byStudent: Record<string, SubjectRegRow> = {};
  (regs ?? []).forEach((r: any) => {
    if (!byStudent[r.student_id]) {
      byStudent[r.student_id] = {
        student_id: r.student_id,
        student_name: r.student_name,
        admission_number: r.admission_number,
        subject_names: [],
      };
    }
    byStudent[r.student_id].subject_names.push(r.subject_name);
  });

  return { subjects, students: (students ?? []) as HubStudent[], registered: Object.values(byStudent) };
}

/**
 * Mirrors hubRegisterAll(): wipes the term's registrations for this class,
 * then registers every student in the class for every subject assigned to
 * the class. Destructive — caller should confirm before calling.
 */
export async function registerAllStudentsAllSubjects(
  classId: string,
  className: string,
  students: { id: string; full_name: string; admission_number: string | null }[],
  subjects: SubjectOption[],
  term: string,
  session: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createBrowserSupabase();
  await supabase.from('subject_registrations').delete().eq('class_id', classId).eq('session', session).eq('term', term);

  const records = students.flatMap((s) =>
    subjects.map((sub) => ({
      student_id: s.id,
      student_name: s.full_name,
      admission_number: s.admission_number,
      class_id: classId,
      class_name: className,
      subject_id: sub.id,
      subject_name: sub.name,
      session,
      term,
    }))
  );

  const { error } = await supabase
    .from('subject_registrations')
    .upsert(records, { onConflict: 'student_id,subject_id,term,session', ignoreDuplicates: true });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Mirrors hubRegisterSubmit(): register one student (or all) for a chosen subset of subjects. */
export async function registerSelected(
  classId: string,
  className: string,
  students: { id: string; full_name: string; admission_number: string | null }[],
  subjects: SubjectOption[],
  term: string,
  session: string
): Promise<{ ok: boolean; error?: string }> {
  if (!subjects.length || !students.length) return { ok: false, error: 'Select at least one subject.' };
  const supabase = createBrowserSupabase();
  const records = students.flatMap((s) =>
    subjects.map((sub) => ({
      student_id: s.id,
      student_name: s.full_name,
      admission_number: s.admission_number,
      class_id: classId,
      class_name: className,
      subject_id: sub.id,
      subject_name: sub.name,
      session,
      term,
    }))
  );
  const { error } = await supabase
    .from('subject_registrations')
    .upsert(records, { onConflict: 'student_id,subject_id,term,session', ignoreDuplicates: true });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ── Tab 3: CBT ────────────────────────────────────────────────────────────

export interface HubCBTExam {
  id: string;
  title: string;
  subject_name: string | null;
  duration_minutes: number;
  total_questions: number | null;
  status: 'draft' | 'active' | 'completed';
  access_code: string;
}

/** Mirrors hubCBT()'s query, scoped to the selected class. */
export async function fetchHubCBTExams(classId: string): Promise<HubCBTExam[]> {
  const supabase = createBrowserSupabase();
  const { data } = await supabase
    .from('cbt_exams').select('*').eq('class_id', classId).order('created_at', { ascending: false });
  return data ?? [];
}

/** Mirrors the subject dropdown source in hubCreateCBT(). */
export async function fetchClassSubjects(classId: string): Promise<SubjectOption[]> {
  const supabase = createBrowserSupabase();
  const { data } = await supabase.from('class_subjects').select('subject_id, subjects(id, name)').eq('class_id', classId);
  return (data ?? []).map((r: any) => r.subjects).filter(Boolean);
}

/** Mirrors _secureCode8() — 8-char alphanumeric access code, avoids ambiguous chars. */
function secureCode8(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = new Uint32Array(8);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 8; i++) out += chars[bytes[i] % chars.length];
  return out;
}

/** Mirrors hubSaveCBT(): creates a new draft CBT exam scoped to this class. */
export async function createHubCBT(params: {
  classId: string;
  className: string;
  title: string;
  subjectId: string | null;
  subjectName: string;
  durationMinutes: number;
  term: string;
  session: string;
  instructions: string;
  createdBy: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (!params.title.trim()) return { ok: false, error: 'Enter exam title.' };
  const supabase = createBrowserSupabase();
  const { error } = await supabase.from('cbt_exams').insert({
    title: params.title.trim(),
    class_id: params.classId,
    class_name: params.className,
    subject_id: params.subjectId || null,
    subject_name: params.subjectName,
    duration_minutes: params.durationMinutes,
    term: params.term,
    session: params.session,
    access_code: secureCode8(),
    instructions: params.instructions,
    status: 'draft',
    created_by: params.createdBy,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteHubCBT(examId: string): Promise<string | null> {
  const supabase = createBrowserSupabase();
  const { error } = await supabase.from('cbt_exams').delete().eq('id', examId);
  return error?.message ?? null;
}

export async function setHubCBTStatus(examId: string, status: 'active' | 'completed'): Promise<string | null> {
  const supabase = createBrowserSupabase();
  const { error } = await supabase.from('cbt_exams').update({ status }).eq('id', examId);
  return error?.message ?? null;
}

// ── Tabs 4–6: Enter Scores / Score Sheet / Mark Sheet ────────────────────
// These three tabs are the SAME engines as results.ts (fetchSheetData /
// checkSheetAccess / saveSheet / grade / isAbsentEntry) and scoresheet.ts
// (fetchScoreSheetPreview / fetchMarkSheetPreview), just re-scoped to the
// class the Hub currently has selected instead of a class picked fresh on
// a standalone page. No new data functions needed here — the component
// layer renders the same ResultsSheet / ScoreSheet / MarkSheet components
// already built for the standalone pages. Re-exported for convenience so
// hub components only need one import.
export { grade, isAbsentEntry } from './results';
export type { GradeBand } from './results';

// ── Tab 7: Affective Traits ───────────────────────────────────────────────

export interface TraitEntry {
  trait: string;
  rating: number; // 1–5
}

export interface HubTraitRecord {
  student_id: string;
  traits: TraitEntry[];
}

export const TRAIT_NAMES = [
  'Punctuality', 'Mental Alertness', 'Behaviour', 'Reliability', 'Respect',
  'Neatness', 'Politeness', 'Honesty', 'Relationship with Staff', 'Relationship with Others',
];

export const TRAIT_LABELS: Record<number, string> = {
  5: 'Excellent', 4: 'Very Good', 3: 'Good', 2: 'Poor', 1: 'Very Poor',
};

/** Mirrors hubAffectiveTraits()'s roster + existing-traits fetch. */
export async function fetchAffectiveTraitsData(
  classId: string,
  term: string,
  session: string
): Promise<{ students: HubStudent[]; traits: Record<string, HubTraitRecord> }> {
  const supabase = createBrowserSupabase();
  const { data: students } = await supabase
    .from('students').select('id, full_name, admission_number').eq('class_id', classId).order('full_name');
  const ids = (students ?? []).map((s: any) => s.id);
  const { data: existing } = ids.length
    ? await supabase.from('affective_traits').select('*').eq('session', session).eq('term', term).in('student_id', ids)
    : { data: [] as any[] };
  const traitMap: Record<string, HubTraitRecord> = {};
  (existing ?? []).forEach((r: any) => {
    traitMap[r.student_id] = { student_id: r.student_id, traits: r.traits ?? [] };
  });
  return { students: (students ?? []) as HubStudent[], traits: traitMap };
}

/**
 * Mirrors genAffectiveTraits(avg) — deterministic trait ratings derived
 * from a student's average score band. Kept intentionally simple (banded
 * mapping) to match the "auto-generate a reasonable starting point, let
 * the teacher override" behavior of the old app.
 */
export function genAffectiveTraits(avg: number): TraitEntry[] {
  const base = avg >= 80 ? 5 : avg >= 70 ? 4 : avg >= 50 ? 3 : avg >= 40 ? 2 : 1;
  return TRAIT_NAMES.map((trait) => ({ trait, rating: base }));
}

/** Mirrors hubGenAllTraits(): auto-generate for students missing traits (or override all). */
export async function generateHubTraits(
  classId: string,
  className: string,
  term: string,
  session: string,
  students: HubStudent[],
  existing: Record<string, HubTraitRecord>,
  override: boolean
): Promise<{ ok: boolean; count: number; error?: string }> {
  const toGen = override ? students : students.filter((s) => !existing[s.id]);
  if (!toGen.length) return { ok: false, count: 0, error: 'All students already have traits. Use Override.' };

  const supabase = createBrowserSupabase();
  const ids = toGen.map((s) => s.id);
  const { data: results } = await supabase
    .from('results').select('student_id, total').eq('class_id', classId).eq('session', session).eq('term', term).in('student_id', ids);

  const avgMap: Record<string, { sum: number; cnt: number }> = {};
  (results ?? []).forEach((r: any) => {
    if (!avgMap[r.student_id]) avgMap[r.student_id] = { sum: 0, cnt: 0 };
    avgMap[r.student_id].sum += parseFloat(r.total) || 0;
    avgMap[r.student_id].cnt++;
  });

  const records = toGen.map((s) => {
    const am = avgMap[s.id];
    const avg = am && am.cnt > 0 ? am.sum / am.cnt : 50;
    return {
      student_id: s.id,
      student_name: s.full_name,
      class_id: classId,
      class_name: className,
      session,
      term,
      traits: genAffectiveTraits(avg),
    };
  });

  const { error } = await supabase.from('affective_traits').upsert(records, { onConflict: 'student_id,term,session' });
  return error ? { ok: false, count: 0, error: error.message } : { ok: true, count: records.length };
}

/** Mirrors hubSaveTrait(): manual per-student override, one rating per trait name. */
export async function saveHubTrait(
  studentId: string,
  studentName: string,
  classId: string,
  className: string,
  term: string,
  session: string,
  traits: TraitEntry[]
): Promise<string | null> {
  const supabase = createBrowserSupabase();
  const { error } = await supabase.from('affective_traits').upsert(
    { student_id: studentId, student_name: studentName, class_id: classId, class_name: className, session, term, traits },
    { onConflict: 'student_id,term,session' }
  );
  return error?.message ?? null;
}

// ── Tab 8: Publish Result ─────────────────────────────────────────────────

export interface PublishRow {
  student_id: string;
  full_name: string;
  admission_number: string | null;
  has_results: boolean;
  published: boolean;
}

/** Mirrors hubLoadPublishList()'s join of roster + per-student published flag. */
export async function fetchPublishList(classId: string, term: string, session: string): Promise<PublishRow[]> {
  const supabase = createBrowserSupabase();
  const [{ data: students }, { data: results }] = await Promise.all([
    supabase.from('students').select('id, full_name, admission_number').eq('class_id', classId).order('full_name'),
    supabase.from('results').select('student_id, published').eq('class_id', classId).eq('term', term).eq('session', session),
  ]);
  const pubMap: Record<string, boolean> = {};
  const hasRes = new Set<string>();
  (results ?? []).forEach((r: any) => {
    pubMap[r.student_id] = r.published;
    hasRes.add(r.student_id);
  });
  return (students ?? []).map((s: any) => ({
    student_id: s.id,
    full_name: s.full_name,
    admission_number: s.admission_number,
    has_results: hasRes.has(s.id),
    published: pubMap[s.id] === true,
  }));
}

/** Mirrors hubTogglePublish(): flip one student's published flag for this class/term/session. */
export async function toggleResultPublish(
  studentId: string,
  classId: string,
  term: string,
  session: string,
  publish: boolean
): Promise<string | null> {
  const supabase = createBrowserSupabase();
  const { error } = await supabase
    .from('results').update({ published: publish }).eq('student_id', studentId).eq('class_id', classId).eq('term', term).eq('session', session);
  return error?.message ?? null;
}

/** Mirrors hubPublishAll(): bulk publish/unpublish every result row for this class/term/session. */
export async function publishAllResults(
  classId: string,
  term: string,
  session: string,
  publish: boolean
): Promise<string | null> {
  const supabase = createBrowserSupabase();
  const { error } = await supabase
    .from('results').update({ published: publish }).eq('class_id', classId).eq('term', term).eq('session', session);
  return error?.message ?? null;
}

// ── Tab 9: Pins ────────────────────────────────────────────────────────────
// Reuses the same Result Pins engine as the dedicated Result Pins screen
// (Feature Checklist row 30 — verify-result-pin-v2 Edge Fn, result_pins_v2
// table) so there is a single source of truth for PIN generation — no
// separate table, no drift between entry points. Once the standalone
// Result Pins page/lib is ported, this tab should import its
// fetch/generate/download functions with classId pre-filled from the Hub's
// selected class, exactly as hubLoadPins() pre-seeds window._rpCtx. Not
// duplicated here to avoid two copies of the PIN-generation logic drifting
// apart — see README note in the delivered output doc.

// ── Tab 10: Clearance ──────────────────────────────────────────────────────

export interface ClearanceRow {
  id: string;
  full_name: string;
  admission_number: string | null;
  cleared: boolean | null;
  blocked: boolean | null;
}

/** Mirrors hubClearance()'s roster + cleared-flag fetch. */
export async function fetchClearanceList(classId: string): Promise<ClearanceRow[]> {
  const supabase = createBrowserSupabase();
  const { data } = await supabase
    .from('students').select('id, full_name, admission_number, cleared, blocked').eq('class_id', classId).order('full_name');
  return data ?? [];
}

/** Mirrors hubToggleClear(): flip one student's cleared flag. */
export async function toggleStudentClear(studentId: string, cleared: boolean): Promise<string | null> {
  const supabase = createBrowserSupabase();
  const { error } = await supabase.from('students').update({ cleared }).eq('id', studentId);
  return error?.message ?? null;
}

/** Mirrors hubClearAllStudents(): bulk clear/unclear every student in this class. */
export async function clearAllStudents(classId: string, cleared: boolean): Promise<string | null> {
  const supabase = createBrowserSupabase();
  const { error } = await supabase.from('students').update({ cleared }).eq('class_id', classId);
  return error?.message ?? null;
}
