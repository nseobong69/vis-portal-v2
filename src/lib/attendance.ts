import { createBrowserSupabase } from './supabase';

// Ported 1:1 from the old app's schema (Section 2.2 row 17 / Phase 0
// table audit): attendance_records, attendance_week_logs,
// school_day_status. Column names and the two onConflict upsert keys
// below are load-bearing — they must match the live Supabase schema
// exactly, not just this file's types.

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
export type DayOfWeek = (typeof DAYS)[number];

export interface ClassOption {
  id: string;
  name: string;
  arm: string | null;
}

export interface StudentLite {
  id: string;
  full_name: string;
  admission_number: string;
  gender: string | null;
}

export interface WeekLog {
  id: string;
  week_number: number;
  session: string;
  term: string;
  class_id: string;
  status: 'active' | 'closed';
  days_completed: DayOfWeek[];
  closed_at: string | null;
}

export interface DayStatus {
  id: string;
  date: string;
  week_number: number;
  day_of_week: DayOfWeek;
  status: 'open' | 'closed';
  closure_reason: string | null;
  session: string;
  term: string;
}

export interface AttendanceRecord {
  id?: string;
  student_id: string;
  admission_number: string;
  student_name: string;
  gender: string;
  class_id: string;
  date: string;
  week_number: number;
  session: string;
  term: string;
  day_of_week: DayOfWeek;
  morning_status: 'present' | 'absent';
  afternoon_status: 'present' | 'absent';
  marked_by: string | null;
}

const MAX_WEEKS = 16;

export function fmtDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export async function fetchClasses(): Promise<ClassOption[]> {
  const supabase = createBrowserSupabase();
  const { data } = await supabase.from('classes').select('id, name, arm').order('name');
  return data ?? [];
}

// ── Per-teacher persisted context (mirrors loadAttPrefs/saveAttPrefs/
// getTeacherAssignedClass in the old app) ──

export interface AttendancePrefs {
  teacher_id: string;
  session: string;
  term: string;
  class_id: string | null;
}

export async function loadAttPrefs(teacherId: string): Promise<AttendancePrefs | null> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from('teacher_attendance_prefs')
    .select('*')
    .eq('teacher_id', teacherId)
    .limit(1);
  if (error) {
    console.warn('[loadAttPrefs]', error);
    return null;
  }
  return data?.[0] ?? null;
}

/** Mirrors saveAttPrefs() — classId is optional so a locked-class teacher can save session/term alone. */
export async function saveAttPrefs(
  teacherId: string,
  session: string,
  term: string,
  classId?: string | null
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createBrowserSupabase();
  const payload: Record<string, unknown> = { teacher_id: teacherId, session, term, updated_at: new Date().toISOString() };
  if (classId && classId.trim() !== '') payload.class_id = classId;
  const { error } = await supabase.from('teacher_attendance_prefs').upsert(payload, { onConflict: 'teacher_id' });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Mirrors getTeacherAssignedClass() — the single class a `teacher` (not `subject_teacher`) is class-teacher of. */
export async function fetchTeacherAssignedClass(teacherId: string): Promise<string | null> {
  const supabase = createBrowserSupabase();
  const { data } = await supabase.from('teacher_classes').select('class_id').eq('teacher_id', teacherId).limit(1);
  return data?.[0]?.class_id ?? null;
}


export async function fetchWeeks(session: string, term: string, classId: string): Promise<WeekLog[]> {
  const supabase = createBrowserSupabase();
  const { data } = await supabase
    .from('attendance_week_logs')
    .select('*')
    .eq('session', session)
    .eq('term', term)
    .eq('class_id', classId)
    .order('week_number');
  return data ?? [];
}

/** Mirrors createWeek(): refuses a new week while one is still active, and caps at 16/term. */
export async function createWeek(
  session: string,
  term: string,
  classId: string,
  weekNumber: number
): Promise<{ ok: boolean; error?: string }> {
  if (weekNumber > MAX_WEEKS) return { ok: false, error: `Maximum ${MAX_WEEKS} weeks per term.` };
  const supabase = createBrowserSupabase();
  const { data: active } = await supabase
    .from('attendance_week_logs')
    .select('id')
    .eq('session', session)
    .eq('term', term)
    .eq('class_id', classId)
    .eq('status', 'active');
  if (active?.length) {
    return { ok: false, error: 'Close the current active week before starting a new one.' };
  }
  const { error } = await supabase
    .from('attendance_week_logs')
    .insert({ week_number: weekNumber, session, term, class_id: classId, status: 'active', days_completed: [] });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Mirrors closeWeekManually() — caller is responsible for the confirm() prompt. */
export async function closeWeekManually(weekId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createBrowserSupabase();
  const { error } = await supabase
    .from('attendance_week_logs')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', weekId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function fetchWeekDayStatuses(session: string, term: string, weekNumber: number): Promise<DayStatus[]> {
  const supabase = createBrowserSupabase();
  const { data } = await supabase
    .from('school_day_status')
    .select('*')
    .eq('session', session)
    .eq('term', term)
    .eq('week_number', weekNumber)
    .order('date');
  return data ?? [];
}

/** Mirrors confirmDayAndLoad()'s upsert — onConflict key must stay (date, session, term). */
export async function upsertDayStatus(input: {
  date: string;
  weekNumber: number;
  day: DayOfWeek;
  status: 'open' | 'closed';
  closureReason: string | null;
  session: string;
  term: string;
  createdBy: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createBrowserSupabase();
  const { error } = await supabase.from('school_day_status').upsert(
    {
      date: input.date,
      week_number: input.weekNumber,
      day_of_week: input.day,
      status: input.status,
      closure_reason: input.status === 'closed' ? input.closureReason : null,
      session: input.session,
      term: input.term,
      created_by: input.createdBy,
    },
    { onConflict: 'date,session,term' }
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function fetchDaySheet(classId: string, date: string, session: string, term: string) {
  const supabase = createBrowserSupabase();
  const [{ data: students }, { data: existing }] = await Promise.all([
    supabase
      .from('students')
      .select('id, full_name, admission_number, gender')
      .eq('class_id', classId)
      .order('full_name'),
    supabase.from('attendance_records').select('*').eq('date', date).eq('session', session).eq('term', term),
  ]);
  const existingByStudent: Record<string, AttendanceRecord> = {};
  (existing ?? []).forEach((r: AttendanceRecord) => (existingByStudent[r.student_id] = r));
  return { students: (students ?? []) as StudentLite[], existingByStudent };
}

/** Mirrors saveDay() + finishDay(): upserts the day's records, then marks the day complete
 *  and auto-closes the week on Friday or once all 5 days are done. */
export async function saveDaySheet(input: {
  weekId: string;
  weekNumber: number;
  day: DayOfWeek;
  date: string;
  session: string;
  term: string;
  classId: string;
  markedBy: string | null;
  records: Array<{ student: StudentLite; morning: 'present' | 'absent'; afternoon: 'present' | 'absent' }>;
}): Promise<{ ok: boolean; error?: string; weekClosed?: boolean }> {
  if (!input.records.length) return { ok: false, error: 'No students loaded.' };
  const supabase = createBrowserSupabase();

  const rows: AttendanceRecord[] = input.records.map(({ student, morning, afternoon }) => ({
    student_id: student.id,
    admission_number: student.admission_number,
    student_name: student.full_name,
    gender: student.gender || 'Male',
    class_id: input.classId,
    date: input.date,
    week_number: input.weekNumber,
    session: input.session,
    term: input.term,
    day_of_week: input.day,
    morning_status: morning,
    afternoon_status: afternoon,
    marked_by: input.markedBy,
  }));

  const { error } = await supabase
    .from('attendance_records')
    .upsert(rows, { onConflict: 'student_id,date,session,term' });
  if (error) return { ok: false, error: error.message };

  const { data: wk } = await supabase.from('attendance_week_logs').select('*').eq('id', input.weekId).single();
  const completed = Array.from(new Set([...(wk?.days_completed ?? []), input.day]));
  const shouldClose = input.day === 'Friday' || completed.length >= 5;
  const update: Record<string, unknown> = { days_completed: completed };
  if (shouldClose) {
    update.status = 'closed';
    update.closed_at = new Date().toISOString();
  }
  await supabase.from('attendance_week_logs').update(update).eq('id', input.weekId);

  return { ok: true, weekClosed: shouldClose };
}

// ── Report data (feeds both the on-screen register and PDF/Excel export) ──

export interface ReportData {
  students: StudentLite[];
  weeks: WeekLog[];
  dayMap: Record<string, DayStatus>; // key: `${weekNumber}:${day}`
  recMap: Record<string, AttendanceRecord>; // key: `${studentId}:${date}`
  session: string;
  term: string;
  className: string;
}

export async function fetchReportData(session: string, term: string, classId: string): Promise<ReportData | null> {
  const supabase = createBrowserSupabase();
  const [{ data: students }, { data: weeks }, { data: dayStatuses }, { data: records }, { data: cls }] =
    await Promise.all([
      supabase
        .from('students')
        .select('id, full_name, admission_number, gender')
        .eq('class_id', classId)
        .order('full_name'),
      supabase
        .from('attendance_week_logs')
        .select('*')
        .eq('session', session)
        .eq('term', term)
        .eq('class_id', classId)
        .order('week_number'),
      supabase.from('school_day_status').select('*').eq('session', session).eq('term', term).order('date'),
      supabase.from('attendance_records').select('*').eq('session', session).eq('term', term).eq('class_id', classId),
      supabase.from('classes').select('name, arm').eq('id', classId).single(),
    ]);

  if (!students?.length) return null;

  const dayMap: Record<string, DayStatus> = {};
  (dayStatuses ?? []).forEach((d: DayStatus) => (dayMap[`${d.week_number}:${d.day_of_week}`] = d));
  const recMap: Record<string, AttendanceRecord> = {};
  (records ?? []).forEach((r: AttendanceRecord) => (recMap[`${r.student_id}:${r.date}`] = r));

  return {
    students: students as StudentLite[],
    weeks: (weeks ?? []) as WeekLog[],
    dayMap,
    recMap,
    session,
    term,
    className: `${cls?.name ?? ''}${cls?.arm ? ' ' + cls.arm : ''}`.trim(),
  };
}

/** Per-student, per-week present-session counts + term-wide stats — shared by the
 *  on-screen register, the PDF, and the Excel export so all three always agree. */
export function computeAttendanceStats(d: ReportData) {
  const wkStats: Record<number, { open: number; tot: number; male: number; female: number }> = {};
  d.weeks.forEach((w) => {
    const open = DAYS.filter((day) => d.dayMap[`${w.week_number}:${day}`]?.status === 'open').length;
    wkStats[w.week_number] = { open, tot: 0, male: 0, female: 0 };
  });

  const perStudent = d.students.map((s) => {
    const isMale = s.gender === 'Male' || s.gender === 'M';
    let grand = 0;
    const byWeek: Record<number, number> = {};
    d.weeks.forEach((w) => {
      let wt = 0;
      DAYS.forEach((day) => {
        const ds = d.dayMap[`${w.week_number}:${day}`];
        if (!ds || ds.status === 'closed') return;
        const rec = ds.date ? d.recMap[`${s.id}:${ds.date}`] : undefined;
        const mp = rec?.morning_status === 'present';
        const ap = rec?.afternoon_status === 'present';
        if (mp) {
          wt++;
          wkStats[w.week_number].tot++;
          isMale ? wkStats[w.week_number].male++ : wkStats[w.week_number].female++;
        }
        if (ap) {
          wt++;
          wkStats[w.week_number].tot++;
          isMale ? wkStats[w.week_number].male++ : wkStats[w.week_number].female++;
        }
      });
      byWeek[w.week_number] = wt;
      grand += wt;
    });
    return { id: s.id, name: s.full_name, admissionNumber: s.admission_number, isMale, byWeek, grand };
  });

  const termOpenDays = d.weeks.reduce((a, w) => a + wkStats[w.week_number].open, 0);
  const termTotal = perStudent.reduce((a, p) => a + p.grand, 0);
  const maleCount = d.students.filter((s) => s.gender === 'Male' || s.gender === 'M').length;
  const termMaxPossible = termOpenDays * 2 * Math.max(1, d.students.length);
  const termAvgPct = termMaxPossible > 0 ? Math.round((termTotal / termMaxPossible) * 100) : 0;

  return { wkStats, perStudent, termOpenDays, termTotal, termAvgPct, maleCount };
}
