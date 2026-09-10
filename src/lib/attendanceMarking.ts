import type { SupabaseClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════════════════
// ATTENDANCE MARKING — server-side data layer for the teacher-facing
// weekly/daily marking workflow (Combined_Project_Phase_Outputs.md's
// Attendance row; index.html ~L12050-12520). This is the piece the
// Batch 2 admin oversight screen (src/pages/admin/attendance.astro)
// deliberately left out — that screen reads what this one writes.
//
// Kept as one server-side module (no client-side Supabase calls) so RLS
// is enforced through the caller's authenticated session the same way
// every other Phase of this migration does it — the old app ran all of
// this from the browser with an anonymous client.
// ═══════════════════════════════════════════════════════════════════════════

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;

export interface AttPrefs {
  teacher_id: string;
  session: string;
  term: string;
  class_id: string;
}

/** Mirrors loadAttPrefs(). */
export async function getAttPrefs(supabase: SupabaseClient, teacherId: string): Promise<AttPrefs | null> {
  const { data } = await supabase.from('teacher_attendance_prefs').select('*').eq('teacher_id', teacherId).limit(1);
  return data?.[0] || null;
}

/** Mirrors saveAttPrefs(). */
export async function saveAttPrefs(supabase: SupabaseClient, teacherId: string, session: string, term: string, classId: string) {
  const payload: Record<string, any> = { teacher_id: teacherId, session, term, updated_at: new Date().toISOString() };
  if (classId?.trim()) payload.class_id = classId;
  const { error } = await supabase.from('teacher_attendance_prefs').upsert(payload, { onConflict: 'teacher_id' });
  return !error;
}

/** Mirrors getTeacherAssignedClass(). */
export async function getTeacherAssignedClass(supabase: SupabaseClient, teacherId: string): Promise<string | null> {
  const { data } = await supabase.from('teacher_classes').select('class_id').eq('teacher_id', teacherId).limit(1);
  return data?.[0]?.class_id || null;
}

export interface WeekLog {
  id: string;
  week_number: number;
  status: string;
  days_completed: string[];
}

/** Mirrors the query in loadWeekPanel(). */
export async function getWeeks(supabase: SupabaseClient, session: string, term: string, classId: string): Promise<WeekLog[]> {
  const { data } = await supabase
    .from('attendance_week_logs')
    .select('*')
    .eq('session', session)
    .eq('term', term)
    .eq('class_id', classId)
    .order('week_number');
  return data || [];
}

/** Mirrors createWeek(). */
export async function createWeek(supabase: SupabaseClient, session: string, term: string, classId: string, weekNum: number) {
  if (weekNum > 16) return { ok: false, error: 'Maximum 16 weeks per term.' };
  const { data: active } = await supabase
    .from('attendance_week_logs')
    .select('id')
    .eq('session', session).eq('term', term).eq('class_id', classId).eq('status', 'active');
  if (active?.length) return { ok: false, error: 'Close the current active week before starting a new one.' };
  const { error } = await supabase
    .from('attendance_week_logs')
    .insert({ week_number: weekNum, session, term, class_id: classId, status: 'active', days_completed: [] });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Mirrors the parallel fetch at the top of loadWeekView(). */
export async function getWeekDetail(supabase: SupabaseClient, weekId: string, session: string, term: string, classId: string) {
  const [{ data: wk }, { data: dayStats }, { data: cls }] = await Promise.all([
    supabase.from('attendance_week_logs').select('*').eq('id', weekId).single(),
    supabase.from('school_day_status').select('*').eq('session', session).eq('term', term).order('date'),
    supabase.from('classes').select('name, arm').eq('id', classId).single(),
  ]);
  const weekDayMap: Record<string, any> = {};
  (dayStats || []).filter((d: any) => d.week_number === wk?.week_number).forEach((d: any) => (weekDayMap[d.day_of_week] = d));
  return { week: wk, weekDayMap, className: cls ? `${cls.name}${cls.arm ? ' ' + cls.arm : ''}` : '' };
}

/** Mirrors the fetch inside openDayEntry(). */
export async function getDayStatus(supabase: SupabaseClient, session: string, term: string, weekNum: number, day: string) {
  const { data } = await supabase
    .from('school_day_status')
    .select('*')
    .eq('session', session).eq('term', term).eq('week_number', weekNum).eq('day_of_week', day)
    .limit(1);
  return data?.[0] || null;
}

/** Mirrors confirmDayAndLoad()'s school_day_status upsert. */
export async function saveDayStatus(
  supabase: SupabaseClient,
  args: { date: string; weekNum: number; day: string; status: 'open' | 'closed'; reason: string | null; session: string; term: string; userId: string }
) {
  const { error } = await supabase.from('school_day_status').upsert(
    {
      date: args.date,
      week_number: args.weekNum,
      day_of_week: args.day,
      status: args.status,
      closure_reason: args.status === 'closed' ? args.reason : null,
      session: args.session,
      term: args.term,
      created_by: args.userId,
    },
    { onConflict: 'date,session,term' }
  );
  return !error ? { ok: true } : { ok: false, error: error.message };
}

export interface DaySheetStudent {
  id: string;
  full_name: string;
  admission_number: string;
  gender: string | null;
  morning_status: string;
  afternoon_status: string;
}

/** Mirrors loadDaySheet()'s parallel fetch + merge. */
export async function getDaySheet(supabase: SupabaseClient, classId: string, date: string, session: string, term: string, weekId: string, day: string) {
  const [{ data: students }, { data: existing }, { data: wkData }] = await Promise.all([
    supabase.from('students').select('id, full_name, admission_number, gender').eq('class_id', classId).order('full_name'),
    supabase.from('attendance_records').select('*').eq('date', date).eq('session', session).eq('term', term),
    supabase.from('attendance_week_logs').select('days_completed, status').eq('id', weekId).single(),
  ]);
  const exMap: Record<string, any> = {};
  (existing || []).forEach((r: any) => (exMap[r.student_id] = r));
  const isDone = (wkData?.days_completed || []).includes(day);
  const canEdit = wkData?.status === 'active' && !isDone;
  const rows: DaySheetStudent[] = (students || []).map((s: any) => ({
    id: s.id,
    full_name: s.full_name,
    admission_number: s.admission_number,
    gender: s.gender,
    morning_status: exMap[s.id]?.morning_status || 'present',
    afternoon_status: exMap[s.id]?.afternoon_status || 'present',
  }));
  return { students: rows, canEdit };
}

export interface DaySaveRow {
  studentId: string;
  admissionNumber: string;
  studentName: string;
  gender: string;
  morning: 'present' | 'absent';
  afternoon: 'present' | 'absent';
}

/** Mirrors saveDay() + finishDay(). */
export async function saveDayAttendance(
  supabase: SupabaseClient,
  args: { weekId: string; day: string; date: string; session: string; term: string; classId: string; weekNum: number; rows: DaySaveRow[]; userId: string }
) {
  if (!args.rows.length) return { ok: false, error: 'No students loaded.' };
  const records = args.rows.map((r) => ({
    student_id: r.studentId,
    admission_number: r.admissionNumber,
    student_name: r.studentName,
    gender: r.gender || 'Male',
    class_id: args.classId,
    date: args.date,
    week_number: args.weekNum,
    session: args.session,
    term: args.term,
    day_of_week: args.day,
    morning_status: r.morning,
    afternoon_status: r.afternoon,
    marked_by: args.userId,
  }));
  const { error } = await supabase.from('attendance_records').upsert(records, { onConflict: 'student_id,date,session,term' });
  if (error) return { ok: false, error: error.message };
  const closed = await finishDay(supabase, args.weekId, args.day);
  return { ok: true, count: records.length, weekClosed: closed };
}

/** Mirrors finishDay() — marks the day complete, auto-closes the week on
 *  Friday or once all 5 days are done. */
async function finishDay(supabase: SupabaseClient, weekId: string, day: string): Promise<boolean> {
  const { data: wk } = await supabase.from('attendance_week_logs').select('*').eq('id', weekId).single();
  const completed = Array.from(new Set([...(wk?.days_completed || []), day]));
  const shouldClose = day === 'Friday' || completed.length >= 5;
  const upd: Record<string, any> = { days_completed: completed };
  if (shouldClose) {
    upd.status = 'closed';
    upd.closed_at = new Date().toISOString();
  }
  await supabase.from('attendance_week_logs').update(upd).eq('id', weekId);
  return shouldClose;
}

/** Mirrors closeWeekManually(). */
export async function closeWeekManually(supabase: SupabaseClient, weekId: string) {
  const { error } = await supabase.from('attendance_week_logs').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', weekId);
  return !error ? { ok: true } : { ok: false, error: error.message };
}
