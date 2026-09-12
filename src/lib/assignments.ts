import { createBrowserSupabase } from './supabase';

// Ported 1:1 from the old app's renderAssignments() / loadClassAssignPanel() /
// quickAssignSubjectTeacher() / assignClassTeacher() / loadClassTeacherList()
// (Feature Checklist row 9: Assignments — "Assign teachers to classes and
// subjects"). Two independent assignment types, matching the old app exactly:
//
//   1. Class Teacher assignment (teacher_classes) — grants FULL access to
//      every subject in that class. One teacher -> many classes.
//   2. Subject Teacher assignment (teacher_subjects) — grants access to ONE
//      subject within ONE class. Scoped per class via the class picker.

export interface TeacherOption {
  id: string;
  full_name: string;
}

export interface ClassOption {
  id: string;
  name: string;
  arm: string | null;
}

export interface SubjectOption {
  id: string;
  name: string;
}

export interface SubjectTeacherRow {
  id: string;
  teacher_id: string;
  subject_id: string;
  teacher_name: string;
  subject_name: string;
}

export interface ClassTeacherRow {
  id: string;
  teacher_name: string;
  class_label: string;
}

/** Mirrors the Promise.all at the top of renderAssignments(). */
export async function fetchAssignmentOptions(): Promise<{
  teachers: TeacherOption[];
  classes: ClassOption[];
  subjects: SubjectOption[];
}> {
  const supabase = createBrowserSupabase();
  const [{ data: teachers }, { data: classes }, { data: subjects }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').order('full_name'),
    supabase.from('classes').select('id, name, arm').order('name'),
    supabase.from('subjects').select('id, name').order('name'),
  ]);
  return { teachers: teachers ?? [], classes: classes ?? [], subjects: subjects ?? [] };
}

/** Mirrors loadClassAssignPanel()'s teacher_subjects fetch for the selected class. */
export async function fetchClassAssignPanel(
  classId: string
): Promise<{ rows: SubjectTeacherRow[]; nullRows: SubjectTeacherRow[] }> {
  const supabase = createBrowserSupabase();
  const [{ data: rows }, { data: nullRows }] = await Promise.all([
    supabase
      .from('teacher_subjects')
      .select('id, teacher_id, subject_id, profiles(full_name), subjects(name)')
      .eq('class_id', classId),
    supabase
      .from('teacher_subjects')
      .select('id, teacher_id, subject_id, profiles(full_name), subjects(name)')
      .is('class_id', null),
  ]);

  const mapRow = (r: any): SubjectTeacherRow => ({
    id: r.id,
    teacher_id: r.teacher_id,
    subject_id: r.subject_id,
    teacher_name: r.profiles?.full_name ?? '—',
    subject_name: r.subjects?.name ?? '—',
  });

  const list = (rows ?? []).map(mapRow).sort((a, b) => a.subject_name.localeCompare(b.subject_name));
  const nulls = (nullRows ?? []).map(mapRow);

  return { rows: list, nullRows: nulls };
}

/**
 * Mirrors quickAssignSubjectTeacher(): inserts one teacher_subjects row per
 * selected subject for the given class. Duplicate-key errors (23505) are
 * counted as "skipped", not failures — same as the old app.
 */
export async function assignSubjectTeachers(
  teacherId: string,
  classId: string,
  subjectIds: string[]
): Promise<{ added: number; skipped: number }> {
  const supabase = createBrowserSupabase();
  let added = 0;
  let skipped = 0;
  for (const subjectId of subjectIds) {
    const { error } = await supabase.from('teacher_subjects').insert({ teacher_id: teacherId, subject_id: subjectId, class_id: classId });
    if (error && (error as any).code === '23505') skipped++;
    else if (!error) added++;
  }
  return { added, skipped };
}

/** Mirrors removeSubjectAssign(). */
export async function removeSubjectAssign(id: string): Promise<void> {
  const supabase = createBrowserSupabase();
  await supabase.from('teacher_subjects').delete().eq('id', id);
}

/** Mirrors loadClassTeacherList(). Manual join — avoids PostgREST FK ambiguity, and throws on error so callers can surface it. */
export async function fetchClassTeacherList(): Promise<ClassTeacherRow[]> {
  const supabase = createBrowserSupabase();
  const { data: tc, error } = await supabase
    .from('teacher_classes')
    .select('id, teacher_id, class_id');
  if (error) throw new Error(`teacher_classes: ${error.message}`);
  if (!tc?.length) return [];

  const teacherIds = [...new Set(tc.map((r) => r.teacher_id))];
  const classIds   = [...new Set(tc.map((r) => r.class_id))];

  const [{ data: profiles, error: pErr }, { data: classes, error: cErr }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').in('id', teacherIds),
    supabase.from('classes').select('id, name, arm').in('id', classIds),
  ]);
  if (pErr) throw new Error(`profiles: ${pErr.message}`);
  if (cErr) throw new Error(`classes: ${cErr.message}`);

  const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name]));
  const classMap   = Object.fromEntries((classes  ?? []).map((c) => [c.id, `${c.name}${c.arm ? ' ' + c.arm : ''}`]));

  return tc.map((r) => ({
    id:           r.id,
    teacher_name: profileMap[r.teacher_id] ?? '—',
    class_label:  classMap[r.class_id]     ?? '—',
  }));
}

/**
 * Mirrors assignClassTeacher(): inserts one teacher_classes row per selected
 * class for the given teacher. Same duplicate-skip behavior as subject
 * assignment.
 */
export async function assignClassTeacher(
  teacherId: string,
  classIds: string[]
): Promise<{ added: number; skipped: number }> {
  const supabase = createBrowserSupabase();
  let added = 0;
  let skipped = 0;
  for (const classId of classIds) {
    const { error } = await supabase.from('teacher_classes').insert({ teacher_id: teacherId, class_id: classId });
    if (error && (error as any).code === '23505') skipped++;
    else if (!error) added++;
  }
  return { added, skipped };
}

/** Mirrors removeClassTeacherAssign(). */
export async function removeClassTeacherAssign(id: string): Promise<void> {
  const supabase = createBrowserSupabase();
  await supabase.from('teacher_classes').delete().eq('id', id);
}
