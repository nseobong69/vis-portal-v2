import { useEffect, useMemo, useState } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Select from '../ui/Select';
import Badge from '../ui/Badge';
import { useToast } from '../ui/Toast';
import {
  DAYS,
  fmtDate,
  fetchClasses,
  fetchWeeks,
  createWeek,
  closeWeekManually,
  fetchWeekDayStatuses,
  upsertDayStatus,
  fetchDaySheet,
  saveDaySheet,
  loadAttPrefs,
  saveAttPrefs,
  fetchTeacherAssignedClass,
  type ClassOption,
  type DayOfWeek,
  type WeekLog,
  type DayStatus,
  type StudentLite,
} from '../../lib/attendance';

const SESSIONS = ['2024/2025', '2025/2026', '2026/2027', '2027/2028'];
const TERMS = ['1st Term', '2nd Term', '3rd Term'];
const CLOSURE_REASONS = ['Public Holiday', 'School Event', 'Strike', 'Weather', 'Other'];

interface Props {
  /** True for a plain `teacher` — their single class-teacher assignment is auto-resolved and locked. */
  autoLockClass: boolean;
  /** From auth.userId (see checkAuth in ../../lib/auth) — stamped onto marked_by, and the prefs row's key. */
  userId: string | null;
}

type DayRowState = { morning: 'present' | 'absent'; afternoon: 'present' | 'absent' };

export default function AttendanceMarker({ autoLockClass, userId }: Props) {
  const toast = useToast();

  // ── Academic context ──
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [session, setSession] = useState(SESSIONS[1]);
  const [term, setTerm] = useState(TERMS[0]);
  const [classId, setClassId] = useState('');
  const [lockedClassId, setLockedClassId] = useState<string | null>(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [editingContext, setEditingContext] = useState(true);

  // ── Weeks ──
  const [weeks, setWeeks] = useState<WeekLog[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<WeekLog | null>(null);
  const [weekDayMap, setWeekDayMap] = useState<Record<DayOfWeek, DayStatus | undefined>>(
    {} as Record<DayOfWeek, DayStatus | undefined>
  );

  // ── Day entry ──
  const [openDay, setOpenDay] = useState<DayOfWeek | null>(null);
  const [entryDate, setEntryDate] = useState('');
  const [entryStatus, setEntryStatus] = useState<'open' | 'closed'>('open');
  const [entryReason, setEntryReason] = useState('');
  const [existingDayStatus, setExistingDayStatus] = useState<DayStatus | null>(null);

  // ── Day sheet (marking table) ──
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [rowState, setRowState] = useState<Record<string, DayRowState>>({});
  const [sheetLoading, setSheetLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Mirrors renderAttendance()'s startup sequence: resolve a locked class
  // (teacher role) in parallel with the class list (used when the picker
  // isn't locked) and the teacher's saved prefs, then auto-fill context
  // from prefs exactly like the old "AUTO-LOADED" chip flow.
  useEffect(() => {
    (async () => {
      const [classList, assignedClassId, prefs] = await Promise.all([
        fetchClasses(),
        autoLockClass && userId ? fetchTeacherAssignedClass(userId) : Promise.resolve(null),
        userId ? loadAttPrefs(userId) : Promise.resolve(null),
      ]);
      setClasses(classList);
      if (assignedClassId) setLockedClassId(assignedClassId);
      if (prefs) {
        setSession(prefs.session);
        setTerm(prefs.term);
        setClassId(assignedClassId ?? prefs.class_id ?? '');
        setEditingContext(false);
      } else if (assignedClassId) {
        setClassId(assignedClassId);
      }
      setPrefsLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLockClass, userId]);

  async function handleSaveContext() {
    if (!userId) return toast.show('danger', 'Cannot identify your account. Please log out and sign in again.');
    if (!session || !term || !classId) return toast.show('danger', 'Fill in Session, Term and Class.');
    const res = await saveAttPrefs(userId, session, term, classId);
    if (!res.ok) return toast.show('danger', res.error || 'Could not save context.');
    toast.show('success', 'Academic context saved!');
    setEditingContext(false);
  }

  useEffect(() => {
    if (lockedClassId) setClassId(lockedClassId);
  }, [lockedClassId]);


  const canPickWeek = !!(session && term && classId);

  async function loadWeeks() {
    if (!canPickWeek) return;
    const w = await fetchWeeks(session, term, classId);
    setWeeks(w);
    setSelectedWeek(null);
    setOpenDay(null);
    const active = w.find((x) => x.status === 'active');
    if (active) selectWeek(active, w);
  }

  useEffect(() => {
    loadWeeks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, term, classId]);

  const maxDone = weeks.reduce((a, w) => Math.max(a, w.week_number), 0);
  const activeWeek = weeks.find((w) => w.status === 'active');
  const canAddWeek = !activeWeek && maxDone < 16;

  async function handleCreateWeek() {
    const res = await createWeek(session, term, classId, maxDone + 1);
    if (!res.ok) return toast.show('danger', res.error || 'Could not start week.');
    toast.show('success', `Week ${maxDone + 1} started!`);
    loadWeeks();
  }

  async function selectWeek(week: WeekLog, weekList: WeekLog[] = weeks) {
    setSelectedWeek(week);
    setOpenDay(null);
    const statuses = await fetchWeekDayStatuses(session, term, week.week_number);
    const map: Record<DayOfWeek, DayStatus | undefined> = {} as Record<DayOfWeek, DayStatus | undefined>;
    statuses.forEach((d) => (map[d.day_of_week] = d));
    setWeekDayMap(map);
  }

  async function handleCloseWeek() {
    if (!selectedWeek) return;
    if (!window.confirm('Manually close this week? No more days can be added after closing.')) return;
    const res = await closeWeekManually(selectedWeek.id);
    if (!res.ok) return toast.show('danger', res.error || 'Could not close week.');
    toast.show('success', 'Week closed.');
    loadWeeks();
  }

  const completedDays = selectedWeek?.days_completed ?? [];

  async function handleOpenDay(day: DayOfWeek) {
    setOpenDay(day);
    setStudents([]);
    setRowState({});
    if (!selectedWeek) return;
    const ds = weekDayMap[day] ?? null;
    setExistingDayStatus(ds);
    setEntryDate(ds?.date ?? '');
    setEntryStatus(ds?.status ?? 'open');
    setEntryReason(ds?.closure_reason ?? '');
    if (ds?.status === 'open') await loadSheet(day, ds.date);
  }

  async function loadSheet(day: DayOfWeek, date: string) {
    if (!selectedWeek || !date) return;
    setSheetLoading(true);
    const { students: s, existingByStudent } = await fetchDaySheet(classId, date, session, term);
    setStudents(s);
    const initial: Record<string, DayRowState> = {};
    s.forEach((stu) => {
      const ex = existingByStudent[stu.id];
      initial[stu.id] = {
        morning: ex?.morning_status ?? 'present',
        afternoon: ex?.afternoon_status ?? 'present',
      };
    });
    setRowState(initial);
    setSheetLoading(false);
  }

  async function handleConfirmDay() {
    if (!selectedWeek || !openDay) return;
    if (!entryDate) return toast.show('danger', 'Please select a date.');
    if (entryStatus === 'closed' && !entryReason) return toast.show('danger', 'Please select a closure reason.');

    const res = await upsertDayStatus({
      date: entryDate,
      weekNumber: selectedWeek.week_number,
      day: openDay,
      status: entryStatus,
      closureReason: entryStatus === 'closed' ? entryReason : null,
      session,
      term,
      createdBy: userId,
    });
    if (!res.ok) return toast.show('danger', res.error || 'Could not save day status.');

    if (entryStatus === 'closed') {
      // Mirrors finishDay() being called directly on a closed day — no marking sheet needed.
      await saveDaySheet({
        weekId: selectedWeek.id,
        weekNumber: selectedWeek.week_number,
        day: openDay,
        date: entryDate,
        session,
        term,
        classId,
        markedBy: userId,
        records: [],
      }).catch(() => null);
      toast.show('success', `${openDay} recorded as Closed — ${entryReason}`);
      loadWeeks();
      return;
    }
    await loadSheet(openDay, entryDate);
  }

  function setAll(morning: 'present' | 'absent', afternoon: 'present' | 'absent') {
    setRowState((prev) => {
      const next: Record<string, DayRowState> = {};
      for (const id of Object.keys(prev)) next[id] = { morning, afternoon };
      return next;
    });
  }

  async function handleSaveDay() {
    if (!selectedWeek || !openDay || !students.length) return toast.show('danger', 'No students loaded.');
    setSaving(true);
    const res = await saveDaySheet({
      weekId: selectedWeek.id,
      weekNumber: selectedWeek.week_number,
      day: openDay,
      date: entryDate,
      session,
      term,
      classId,
      markedBy: userId,
      records: students.map((student) => ({ student, ...rowState[student.id] })),
    });
    setSaving(false);
    if (!res.ok) return toast.show('danger', res.error || 'Could not save attendance.');
    toast.show('success', `Attendance saved for ${students.length} students!`);
    if (res.weekClosed) toast.show('info', 'Week automatically closed (5 days done).');
    loadWeeks();
  }

  const canEditDay = selectedWeek?.status === 'active' && openDay && !completedDays.includes(openDay);
  const isDayDone = openDay ? completedDays.includes(openDay) : false;

  const classOptions = useMemo(
    () => classes.map((c) => ({ value: c.id, label: `${c.name}${c.arm ? ' ' + c.arm : ''}` })),
    [classes]
  );

  return (
    <div className="flex flex-col gap-5">
      <Card title="Academic Context"
        footer={!editingContext ? (
          <Button size="sm" variant="secondary" onClick={() => setEditingContext(true)}>Edit</Button>
        ) : undefined}>
        {!prefsLoaded ? (
          <p className="text-sm text-brand-brown-light">Loading…</p>
        ) : !editingContext ? (
          <div className="grid grid-cols-3 gap-3">
            {[['Session', session], ['Term', term], ['Class', classOptions.find((c) => c.value === classId)?.label ?? classId]].map(([label, value]) => (
              <div key={label} className="text-center">
                <div className="text-[10px] uppercase tracking-wide text-brand-brown-light">{label}</div>
                <div className="text-sm font-semibold text-brand-brown-dark">{value || '—'}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-4 items-end">
            <Select id="att-session" label="Session" value={session} onChange={(e) => setSession(e.target.value)}
              options={SESSIONS.map((s) => ({ value: s, label: s }))} />
            <Select id="att-term" label="Term" value={term} onChange={(e) => setTerm(e.target.value)}
              options={TERMS.map((t) => ({ value: t, label: t }))} />
            {lockedClassId ? (
              <div className="text-sm text-brand-brown-light">
                Class: <span className="font-semibold text-brand-brown-dark">{classOptions.find((c) => c.value === lockedClassId)?.label ?? lockedClassId}</span>
                <span className="ml-1">(your assigned class)</span>
              </div>
            ) : (
              <Select id="att-class" label="Class" value={classId} onChange={(e) => setClassId(e.target.value)}
                placeholder="Select class" options={classOptions} />
            )}
            <Button size="sm" onClick={handleSaveContext}>Save Context</Button>
          </div>
        )}
      </Card>

      {canPickWeek && (
        <Card title={`Weeks — ${session} · ${term}`}
          footer={canAddWeek ? (
            <Button size="sm" onClick={handleCreateWeek}>Start Week {maxDone + 1}</Button>
          ) : undefined}>
          {weeks.length === 0 ? (
            <p className="text-sm text-brand-brown-light">No weeks started yet. Use "Start Week 1" below.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {weeks.map((w) => {
                const closed = w.status === 'closed';
                const isSelected = selectedWeek?.id === w.id;
                return (
                  <button key={w.id} onClick={() => selectWeek(w)}
                    className={[
                      'min-w-[84px] text-center rounded-lg border-2 px-3 py-2 transition-colors',
                      closed ? 'border-success-700 bg-success-soft' : w.status === 'active' ? 'border-warning-700 bg-warning-soft' : 'border-brand-cream-dark bg-white',
                      isSelected ? 'ring-2 ring-brand-gold' : '',
                    ].join(' ')}>
                    <div className="font-heading font-bold text-sm text-brand-brown-dark">Wk {w.week_number}</div>
                    <div className={`text-[10px] font-bold mt-0.5 ${closed ? 'text-success-700' : w.status === 'active' ? 'text-warning-700' : 'text-brand-brown-light'}`}>
                      {closed ? 'DONE' : w.status === 'active' ? 'ACTIVE' : '—'}
                    </div>
                    <div className="text-[9px] text-brand-brown-light mt-0.5">{(w.days_completed ?? []).length}/5 days</div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {selectedWeek && (
        <Card title={`Week ${selectedWeek.week_number}`}
          footer={selectedWeek.status === 'active' ? (
            <Button size="sm" variant="danger" onClick={handleCloseWeek}>Close Week</Button>
          ) : (
            <Badge tone="neutral">Closed</Badge>
          )}>
          <div className="grid grid-cols-5 gap-2 mb-4">
            {DAYS.map((day) => {
              const ds = weekDayMap[day];
              const done = completedDays.includes(day);
              const dayIsClosed = ds?.status === 'closed';
              const isOpenDay = openDay === day;
              return (
                <button key={day} onClick={() => handleOpenDay(day)}
                  className={[
                    'rounded-lg border-2 px-2 py-2 text-center transition-colors',
                    done ? (dayIsClosed ? 'border-danger-700 bg-danger-soft' : 'border-success-700 bg-success-soft') : 'border-brand-cream-dark bg-white',
                    isOpenDay ? 'ring-2 ring-brand-gold' : '',
                  ].join(' ')}>
                  <div className="font-heading font-bold text-xs text-brand-brown-dark">{day.slice(0, 3)}</div>
                  <div className={`text-[10px] font-semibold mt-0.5 ${done ? (dayIsClosed ? 'text-danger-700' : 'text-success-700') : 'text-brand-brown-light'}`}>
                    {done ? (dayIsClosed ? 'CLOSED' : 'DONE') : 'PENDING'}
                  </div>
                  {ds?.date && <div className="text-[9px] text-brand-brown-light mt-0.5">{fmtDate(ds.date)}</div>}
                </button>
              );
            })}
          </div>

          {openDay && (
            <div className="border-t border-brand-cream-dark pt-4">
              <div className="font-heading font-bold text-sm text-brand-brown-dark mb-3">
                {openDay} — Week {selectedWeek.week_number}
              </div>
              <div className="flex flex-wrap gap-3 items-end mb-4">
                <div className="flex flex-col gap-1">
                  <label htmlFor="entry-date" className="text-sm font-medium text-brand-brown-dark">Date</label>
                  <input id="entry-date" type="date" value={entryDate} disabled={!!isDayDone || selectedWeek.status !== 'active'}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="rounded-sm border border-brand-cream-dark px-3 py-2 text-sm" />
                </div>
                <Select id="entry-status" label="School Status" value={entryStatus}
                  disabled={!!isDayDone || selectedWeek.status !== 'active'}
                  onChange={(e) => setEntryStatus(e.target.value as 'open' | 'closed')}
                  options={[{ value: 'open', label: 'School Open' }, { value: 'closed', label: 'School Closed' }]} />
                {entryStatus === 'closed' && (
                  <Select id="entry-reason" label="Closure Reason" value={entryReason}
                    disabled={!!isDayDone || selectedWeek.status !== 'active'}
                    onChange={(e) => setEntryReason(e.target.value)}
                    placeholder="Select reason"
                    options={CLOSURE_REASONS.map((r) => ({ value: r, label: r }))} />
                )}
                {canEditDay && !existingDayStatus && (
                  <Button onClick={handleConfirmDay}>Confirm &amp; Mark</Button>
                )}
              </div>

              {existingDayStatus?.status === 'closed' && (
                <div className="rounded-lg bg-danger-soft p-4 max-w-sm text-center">
                  <div className="font-heading font-bold text-sm text-danger-700">School Closed</div>
                  <div className="text-xs text-brand-brown-light mt-1">
                    Reason: <strong>{existingDayStatus.closure_reason}</strong> · {fmtDate(existingDayStatus.date)}
                  </div>
                </div>
              )}

              {sheetLoading && <p className="text-sm text-brand-brown-light">Loading students…</p>}

              {!sheetLoading && students.length > 0 && (
                <div className="border-t border-brand-cream-dark pt-3 mt-2">
                  <div className="flex justify-between items-center flex-wrap gap-2 mb-3">
                    <div className="font-heading font-bold text-sm text-brand-brown-dark">
                      {fmtDate(entryDate)} — {students.length} Student(s)
                    </div>
                    {canEditDay ? (
                      <div className="flex gap-2 flex-wrap">
                        <Button size="sm" variant="secondary" onClick={() => setAll('present', 'present')}>All Present</Button>
                        <Button size="sm" variant="danger" onClick={() => setAll('absent', 'absent')}>All Absent</Button>
                        <Button size="sm" onClick={handleSaveDay} disabled={saving}>
                          {saving ? 'Saving…' : 'Save & Complete Day'}
                        </Button>
                      </div>
                    ) : (
                      <Badge tone="success">Day Completed</Badge>
                    )}
                  </div>

                  <div className="overflow-x-auto rounded-md border border-brand-cream-dark">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-brand-cream text-brand-brown-dark">
                        <tr>
                          <th className="px-3 py-2 text-xs font-heading font-semibold uppercase w-8">#</th>
                          <th className="px-3 py-2 text-xs font-heading font-semibold uppercase">Student</th>
                          <th className="px-3 py-2 text-xs font-heading font-semibold uppercase">Adm No</th>
                          <th className="px-3 py-2 text-xs font-heading font-semibold uppercase text-center">Morning</th>
                          <th className="px-3 py-2 text-xs font-heading font-semibold uppercase text-center">Afternoon</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-brand-cream-dark">
                        {students.map((s, i) => {
                          const state = rowState[s.id] ?? { morning: 'present', afternoon: 'present' };
                          return (
                            <tr key={s.id}>
                              <td className="px-3 py-2 text-brand-brown-light">{i + 1}</td>
                              <td className="px-3 py-2 font-medium text-brand-brown-dark">{s.full_name}</td>
                              <td className="px-3 py-2 text-brand-brown-light text-xs">{s.admission_number}</td>
                              {(['morning', 'afternoon'] as const).map((slot) => (
                                <td key={slot} className="px-3 py-2 text-center">
                                  {canEditDay ? (
                                    <select value={state[slot]}
                                      onChange={(e) =>
                                        setRowState((prev) => ({
                                          ...prev,
                                          [s.id]: { ...prev[s.id], [slot]: e.target.value as 'present' | 'absent' },
                                        }))
                                      }
                                      className="text-xs rounded border border-brand-cream-dark px-2 py-1">
                                      <option value="present">Present</option>
                                      <option value="absent">Absent</option>
                                    </select>
                                  ) : (
                                    <span className={state[slot] === 'present' ? 'text-success-700' : 'text-danger-700'}>
                                      {state[slot] === 'present' ? '✓' : '○'}
                                    </span>
                                  )}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
