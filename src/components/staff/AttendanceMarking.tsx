import { useEffect, useState } from 'react';
import Card from '../ui/Card';
import Select from '../ui/Select';
import Button from '../ui/Button';
import { useToast } from '../ui/Toast';

const SESSIONS = ['2024/2025', '2025/2026', '2026/2027', '2027/2028'];
const TERMS = ['1st Term', '2nd Term', '3rd Term'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const REASONS = ['Public Holiday', 'School Event', 'Strike', 'Weather', 'Other'];

async function call(body: object) {
  const res = await fetch('/api/staff/attendance/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

interface ClassOption { id: string; name: string; arm: string | null }
interface Props {
  role: string;
  isSubjectTeacherOnly: boolean; // subject_teacher without a plain teacher role — mirrors the old app's lock screen
}

export default function AttendanceMarking({ role, isSubjectTeacherOnly }: Props) {
  const { show: toastShow } = useToast();
  const [loading, setLoading] = useState(true);

  const [prefs, setPrefs] = useState<{ session: string; term: string; class_id: string } | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [assignedClassId, setAssignedClassId] = useState<string | null>(null);
  const [editingPrefs, setEditingPrefs] = useState(false);
  const [formSession, setFormSession] = useState(SESSIONS[SESSIONS.length - 1]);
  const [formTerm, setFormTerm] = useState(TERMS[0]);
  const [formClassId, setFormClassId] = useState('');

  const [weeks, setWeeks] = useState<{ id: string; week_number: number; status: string; days_completed: string[] }[]>([]);
  const [weekView, setWeekView] = useState<{ id: string; week_number: number } | null>(null);
  const [weekDayMap, setWeekDayMap] = useState<Record<string, any>>({});
  const [className, setClassName] = useState('');

  const [dayView, setDayView] = useState<string | null>(null); // day name currently open
  const [dayStatus, setDayStatus] = useState<'open' | 'closed'>('open');
  const [dayReason, setDayReason] = useState(REASONS[0]);
  const [dayDate, setDayDate] = useState('');
  const [dayCanEdit, setDayCanEdit] = useState(true);
  const [existingDayClosed, setExistingDayClosed] = useState<any>(null);

  const [sheetRows, setSheetRows] = useState<
    { id: string; full_name: string; admission_number: string; gender: string | null; morning_status: string; afternoon_status: string }[]
  >([]);
  const [sheetCanEdit, setSheetCanEdit] = useState(true);
  const [saving, setSaving] = useState(false);

  const showClassPicker = role !== 'teacher' || !assignedClassId;

  useEffect(() => {
    if (isSubjectTeacherOnly) return;
    call({ action: 'init' })
      .then((data) => {
        setPrefs(data.prefs);
        setClasses(data.classes || []);
        setAssignedClassId(data.assignedClassId);
        if (data.prefs) {
          setFormSession(data.prefs.session);
          setFormTerm(data.prefs.term);
          setFormClassId(data.prefs.class_id);
          loadWeeks(data.prefs.session, data.prefs.term, data.prefs.class_id);
        } else {
          setEditingPrefs(true);
        }
      })
      .catch((e) => toastShow('danger', e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadWeeks(session: string, term: string, classId: string) {
    const data = await call({ action: 'getWeeks', session, term, classId });
    setWeeks(data.weeks || []);
    setWeekView(null);
    setDayView(null);
  }

  async function savePrefs() {
    if (!formSession || !formTerm || !formClassId) {
      toastShow('danger', 'Fill in Session, Term and Class.');
      return;
    }
    try {
      await call({ action: 'savePrefs', session: formSession, term: formTerm, classId: formClassId });
      const newPrefs = { session: formSession, term: formTerm, class_id: formClassId };
      setPrefs(newPrefs);
      setEditingPrefs(false);
      toastShow('success', '✅ Academic context saved!');
      loadWeeks(newPrefs.session, newPrefs.term, newPrefs.class_id);
    } catch (e: any) {
      toastShow('danger', e.message);
    }
  }

  const maxDone = weeks.reduce((a, w) => Math.max(a, w.week_number), 0);
  const activeWeek = weeks.find((w) => w.status === 'active');
  const canAddWeek = !activeWeek && maxDone < 16;

  async function startWeek() {
    if (!prefs) return;
    try {
      await call({ action: 'createWeek', session: prefs.session, term: prefs.term, classId: prefs.class_id, weekNum: maxDone + 1 });
      toastShow('success', `✅ Week ${maxDone + 1} started!`);
      loadWeeks(prefs.session, prefs.term, prefs.class_id);
    } catch (e: any) {
      toastShow('danger', e.message);
    }
  }

  async function openWeek(w: { id: string; week_number: number }) {
    if (!prefs) return;
    const data = await call({ action: 'getWeekDetail', weekId: w.id, session: prefs.session, term: prefs.term, classId: prefs.class_id });
    setWeekView(w);
    setWeekDayMap(data.weekDayMap || {});
    setClassName(data.className || '');
    setDayView(null);
  }

  async function closeWeek() {
    if (!weekView) return;
    if (!confirm('Manually close this week? No more days can be added after closing.')) return;
    try {
      await call({ action: 'closeWeek', weekId: weekView.id });
      toastShow('success', 'Week closed.');
      if (prefs) loadWeeks(prefs.session, prefs.term, prefs.class_id);
    } catch (e: any) {
      toastShow('danger', e.message);
    }
  }

  async function openDay(day: string) {
    if (!weekView || !prefs) return;
    setDayView(day);
    setSheetRows([]);
    setExistingDayClosed(null);
    const data = await call({ action: 'getDayStatus', session: prefs.session, term: prefs.term, weekNum: weekView.week_number, day });
    const ds = data.status;
    const completed = weeks.find((w) => w.id === weekView.id)?.days_completed || [];
    const isDone = completed.includes(day);
    const canEdit = !isDone; // week is active if we got here (closed weeks still viewable read-only via day sheet fetch)
    setDayCanEdit(canEdit);
    setDayDate(ds?.date || '');
    setDayStatus(ds?.status || 'open');
    setDayReason(ds?.closure_reason || REASONS[0]);
    if (ds?.status === 'closed') {
      setExistingDayClosed(ds);
    } else if (ds?.status === 'open') {
      loadSheet(day, ds.date);
    }
  }

  async function confirmDay() {
    if (!weekView || !prefs || !dayView) return;
    if (!dayDate) {
      toastShow('danger', 'Please select a date.');
      return;
    }
    try {
      await call({
        action: 'saveDayStatus',
        date: dayDate,
        weekNum: weekView.week_number,
        day: dayView,
        status: dayStatus,
        reason: dayStatus === 'closed' ? dayReason : null,
        session: prefs.session,
        term: prefs.term,
      });
      if (dayStatus === 'closed') {
        await call({
          action: 'saveDayAttendance',
          weekId: weekView.id, day: dayView, date: dayDate, session: prefs.session, term: prefs.term,
          classId: prefs.class_id, weekNum: weekView.week_number, rows: [],
        }).catch(() => {}); // finishDay side-effect only; no students to save for a closed day
        setExistingDayClosed({ status: 'closed', closure_reason: dayReason, date: dayDate });
        toastShow('success', `✅ ${dayView} recorded as Closed — ${dayReason}`);
        loadWeeks(prefs.session, prefs.term, prefs.class_id);
        return;
      }
      loadSheet(dayView, dayDate);
    } catch (e: any) {
      toastShow('danger', e.message);
    }
  }

  async function loadSheet(day: string, date: string) {
    if (!weekView || !prefs) return;
    const data = await call({ action: 'getDaySheet', classId: prefs.class_id, date, session: prefs.session, term: prefs.term, weekId: weekView.id, day });
    setSheetRows(data.students || []);
    setSheetCanEdit(data.canEdit);
  }

  function setAll(m: 'present' | 'absent', a: 'present' | 'absent') {
    setSheetRows((prev) => prev.map((r) => ({ ...r, morning_status: m, afternoon_status: a })));
  }

  async function saveDay() {
    if (!weekView || !prefs || !dayView) return;
    setSaving(true);
    try {
      const rows = sheetRows.map((r) => ({
        studentId: r.id, admissionNumber: r.admission_number, studentName: r.full_name, gender: r.gender || 'Male',
        morning: r.morning_status, afternoon: r.afternoon_status,
      }));
      const data = await call({
        action: 'saveDayAttendance', weekId: weekView.id, day: dayView, date: dayDate, session: prefs.session, term: prefs.term,
        classId: prefs.class_id, weekNum: weekView.week_number, rows,
      });
      toastShow('success', `✅ Attendance saved for ${data.count} students!${data.weekClosed ? ' Week automatically closed.' : ''}`);
      loadWeeks(prefs.session, prefs.term, prefs.class_id);
    } catch (e: any) {
      toastShow('danger', e.message);
    } finally {
      setSaving(false);
    }
  }

  if (isSubjectTeacherOnly) {
    return (
      <Card>
        <div className="text-center text-danger-700 py-8">
          Subject teachers are not assigned to mark class attendance. Please contact the class teacher.
        </div>
      </Card>
    );
  }

  if (loading) return <Card>Loading…</Card>;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Academic Context ── */}
      <Card>
        <div className="flex justify-between items-center mb-3">
          <div className="font-heading font-bold text-brand-brown-dark">
            Academic Context {prefs && !editingPrefs && <span className="text-[10px] bg-brand-cream px-2 py-0.5 rounded ml-1">AUTO-LOADED</span>}
          </div>
          {prefs && !editingPrefs && (
            <Button variant="secondary" onClick={() => setEditingPrefs(true)}>
              Edit
            </Button>
          )}
        </div>
        {prefs && !editingPrefs ? (
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div><span className="text-brand-brown-light">Session:</span> {prefs.session}</div>
            <div><span className="text-brand-brown-light">Term:</span> {prefs.term}</div>
            <div><span className="text-brand-brown-light">Class:</span> {classes.find((c) => c.id === prefs.class_id)?.name || '—'}</div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3 items-end">
            <Select id="att-sess" label="Session" options={SESSIONS.map((s) => ({ value: s, label: s }))} value={formSession} onChange={(e) => setFormSession(e.target.value)} />
            <Select id="att-term" label="Term" options={TERMS.map((t) => ({ value: t, label: t }))} value={formTerm} onChange={(e) => setFormTerm(e.target.value)} />
            {showClassPicker ? (
              <Select
                id="att-cls"
                label="Class"
                placeholder="Select Class"
                options={classes.map((c) => ({ value: c.id, label: `${c.name}${c.arm ? ' ' + c.arm : ''}` }))}
                value={formClassId}
                onChange={(e) => setFormClassId(e.target.value)}
              />
            ) : (
              <input type="hidden" value={assignedClassId || ''} />
            )}
            <Button variant="primary" onClick={savePrefs}>
              Save Context
            </Button>
          </div>
        )}
      </Card>

      {/* ── Weeks ── */}
      {prefs && !editingPrefs && (
        <Card>
          <div className="flex justify-between items-center flex-wrap gap-2 mb-3">
            <div className="font-heading font-bold text-brand-brown-dark">Weeks — {prefs.session} · {prefs.term}</div>
            {canAddWeek && (
              <Button variant="primary" onClick={startWeek}>
                Start Week {maxDone + 1}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {weeks.length === 0 && <div className="text-brand-brown-light text-sm">No weeks started yet.</div>}
            {weeks.map((w) => {
              const closed = w.status === 'closed';
              const active = w.status === 'active';
              return (
                <button
                  key={w.id}
                  onClick={() => openWeek(w)}
                  className={`px-4 py-2.5 rounded-xl min-w-[82px] text-center border-2 ${
                    closed ? 'border-success-700 bg-success-700/10' : active ? 'border-warning-700 bg-warning-700/10' : 'border-brand-cream-dark bg-white'
                  } ${weekView?.id === w.id ? 'ring-2 ring-brand-brown-dark' : ''}`}
                >
                  <div className="font-bold text-sm text-brand-brown-dark">Wk {w.week_number}</div>
                  <div className={`text-[10px] font-bold mt-0.5 ${closed ? 'text-success-700' : active ? 'text-warning-700' : 'text-brand-brown-light'}`}>
                    {closed ? 'DONE' : active ? 'ACTIVE' : '—'}
                  </div>
                  <div className="text-[9.5px] text-brand-brown-light mt-0.5">{(w.days_completed || []).length}/5 days</div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── Week Detail: day buttons ── */}
      {weekView && (
        <Card>
          <div className="flex justify-between items-center flex-wrap gap-2 mb-4">
            <div>
              <div className="font-heading font-bold text-brand-brown-dark">Week {weekView.week_number} — {className}</div>
              <div className="text-xs text-brand-brown-light mt-0.5">{prefs?.session} · {prefs?.term}</div>
            </div>
            {weeks.find((w) => w.id === weekView.id)?.status === 'active' && (
              <Button variant="danger" onClick={closeWeek}>
                Close Week
              </Button>
            )}
          </div>
          <div className="grid grid-cols-5 gap-2 mb-4">
            {DAYS.map((d) => {
              const wk = weeks.find((w) => w.id === weekView.id);
              const done = (wk?.days_completed || []).includes(d);
              const ds = weekDayMap[d];
              const isClosed = ds?.status === 'closed';
              return (
                <button
                  key={d}
                  onClick={() => openDay(d)}
                  className={`p-2.5 rounded-xl text-center border-2 ${
                    done ? (isClosed ? 'border-danger-700 bg-danger-700/10' : 'border-success-700 bg-success-700/10') : 'border-brand-cream-dark bg-white'
                  } ${dayView === d ? 'ring-2 ring-brand-brown-dark' : ''}`}
                >
                  <div className="font-bold text-sm text-brand-brown-dark">{d.slice(0, 3)}</div>
                  <div className={`text-[10px] font-semibold mt-0.5 ${done ? (isClosed ? 'text-danger-700' : 'text-success-700') : 'text-brand-brown-light'}`}>
                    {done ? (isClosed ? 'CLOSED' : 'DONE') : 'PENDING'}
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── Day Entry ── */}
          {dayView && (
            <div className="border-t border-brand-cream-dark pt-4">
              <div className="font-bold text-sm text-brand-brown-dark mb-3">{dayView} — Week {weekView.week_number}</div>
              {existingDayClosed ? (
                <div className="bg-danger-700/10 rounded-xl p-4 text-center max-w-sm">
                  <div className="font-bold text-danger-700">School Closed</div>
                  <div className="text-xs text-brand-brown-light mt-1">Reason: {existingDayClosed.closure_reason}</div>
                  <div className="text-xs text-brand-brown-light mt-1">{existingDayClosed.date}</div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-3 items-end mb-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-medium text-brand-brown-dark">Date</label>
                      <input type="date" value={dayDate} disabled={!dayCanEdit} onChange={(e) => setDayDate(e.target.value)} className="border border-brand-cream-dark rounded-sm px-3 py-2 text-sm" />
                    </div>
                    <Select
                      id="entry-status"
                      label="School Status"
                      options={[{ value: 'open', label: '🟢 School Open' }, { value: 'closed', label: '🔴 School Closed' }]}
                      value={dayStatus}
                      onChange={(e) => setDayStatus(e.target.value as any)}
                    />
                    {dayStatus === 'closed' && (
                      <Select id="entry-reason" label="Closure Reason" options={REASONS.map((r) => ({ value: r, label: r }))} value={dayReason} onChange={(e) => setDayReason(e.target.value)} />
                    )}
                    {dayCanEdit && (
                      <Button variant="primary" onClick={confirmDay}>
                        Confirm &amp; Mark
                      </Button>
                    )}
                  </div>

                  {sheetRows.length > 0 && (
                    <div>
                      <div className="flex justify-between items-center flex-wrap gap-2 mb-3">
                        <div className="font-bold text-sm text-brand-brown-dark">{dayView}, {dayDate} — {sheetRows.length} Student(s)</div>
                        {sheetCanEdit ? (
                          <div className="flex gap-2 flex-wrap">
                            <Button variant="secondary" onClick={() => setAll('present', 'present')}>All Present</Button>
                            <Button variant="secondary" onClick={() => setAll('absent', 'absent')}>All Absent</Button>
                            <Button variant="primary" onClick={saveDay} disabled={saving}>
                              {saving ? 'Saving…' : 'Save & Complete Day'}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs bg-brand-cream px-2 py-1 rounded">Day Completed</span>
                        )}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-brand-cream text-xs uppercase text-brand-brown-light">
                            <tr>
                              <th className="text-left px-3 py-2">#</th>
                              <th className="text-left px-3 py-2">Student</th>
                              <th className="text-left px-3 py-2">Adm No</th>
                              <th className="text-center px-3 py-2">Morning</th>
                              <th className="text-center px-3 py-2">Afternoon</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sheetRows.map((s, i) => (
                              <tr key={s.id} className="border-t border-brand-cream-dark">
                                <td className="px-3 py-2 text-brand-brown-light">{i + 1}</td>
                                <td className="px-3 py-2 font-medium text-brand-brown-dark">{s.full_name}</td>
                                <td className="px-3 py-2 text-xs text-brand-brown-light">{s.admission_number}</td>
                                <td className="px-3 py-2 text-center">
                                  {sheetCanEdit ? (
                                    <select
                                      value={s.morning_status}
                                      onChange={(e) => setSheetRows((prev) => prev.map((r) => (r.id === s.id ? { ...r, morning_status: e.target.value } : r)))}
                                      className="border border-brand-cream-dark rounded-sm px-2 py-1 text-xs"
                                    >
                                      <option value="present">✓ Present</option>
                                      <option value="absent">○ Absent</option>
                                    </select>
                                  ) : (
                                    <span className={s.morning_status === 'present' ? 'text-success-700' : 'text-danger-700'}>{s.morning_status === 'present' ? '✓' : '○'}</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {sheetCanEdit ? (
                                    <select
                                      value={s.afternoon_status}
                                      onChange={(e) => setSheetRows((prev) => prev.map((r) => (r.id === s.id ? { ...r, afternoon_status: e.target.value } : r)))}
                                      className="border border-brand-cream-dark rounded-sm px-2 py-1 text-xs"
                                    >
                                      <option value="present">✓ Present</option>
                                      <option value="absent">○ Absent</option>
                                    </select>
                                  ) : (
                                    <span className={s.afternoon_status === 'present' ? 'text-success-700' : 'text-danger-700'}>{s.afternoon_status === 'present' ? '✓' : '○'}</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
