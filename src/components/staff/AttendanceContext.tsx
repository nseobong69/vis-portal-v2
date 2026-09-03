import { useState } from 'react';
import Button from '../ui/Button';

interface ClassOption {
  id: string;
  name: string;
  arm: string | null;
}

interface Prefs {
  session: string;
  term: string;
  class_id: string;
}

interface Week {
  id: string;
  week_number: number;
  status: 'active' | 'closed';
  days_completed: string[] | null;
}

interface Props {
  classes: ClassOption[];
  initialPrefs: Prefs | null;
  assignedClassId: string | null; // set when role === 'teacher' and they have exactly one class-teacher assignment
  showClassPicker: boolean; // false when a teacher's single assigned class is used instead (ports old app's `showCls`)
  initialWeeks: Week[];
}

const SESSIONS = ['2024/2025', '2025/2026', '2026/2027', '2027/2028', '2028/2029', '2029/2030', '2030/2031', '2031/2032', '2032/2033'];
const TERMS = ['1st Term', '2nd Term', '3rd Term'];

function classLabel(c: ClassOption) {
  return c.arm ? `${c.name} ${c.arm}` : c.name;
}

// Ports index.html's renderAttendance() academic-context card +
// loadWeekPanel()/createWeek() as one client island. Day-by-day marking
// (loadWeekView + the actual present/absent sheet), week closing, PDF
// export, and Excel export are the next continuation piece — this pass
// gets a teacher to "a week is open, ready to mark" and no further.
export default function AttendanceContext({ classes, initialPrefs, assignedClassId, showClassPicker, initialWeeks }: Props) {
  const [prefs, setPrefs] = useState<Prefs | null>(initialPrefs);
  const [editing, setEditing] = useState(!initialPrefs);
  const [session, setSession] = useState(initialPrefs?.session || SESSIONS[1]);
  const [term, setTerm] = useState(initialPrefs?.term || TERMS[0]);
  const [classId, setClassId] = useState(initialPrefs?.class_id || assignedClassId || '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [weeks, setWeeks] = useState<Week[]>(initialWeeks);
  const [creating, setCreating] = useState(false);
  const [weekError, setWeekError] = useState<string | null>(null);

  const savedClass = prefs ? classes.find((c) => c.id === prefs.class_id) : null;

  async function savePrefs() {
    if (!session || !term || !classId) {
      setSaveError('Fill in Session, Term and Class.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/staff/attendance/prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session, term, class_id: classId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save context.');
      const newPrefs = { session, term, class_id: classId };
      setPrefs(newPrefs);
      setEditing(false);
      await refreshWeeks(newPrefs);
    } catch (e: any) {
      setSaveError(e?.message || 'Could not save context.');
    } finally {
      setSaving(false);
    }
  }

  async function refreshWeeks(p: Prefs) {
    try {
      const res = await fetch(
        `/api/staff/attendance/weeks?session=${encodeURIComponent(p.session)}&term=${encodeURIComponent(p.term)}&class_id=${encodeURIComponent(p.class_id)}`
      );
      const json = await res.json();
      if (res.ok) setWeeks(json.weeks ?? []);
    } catch {
      // Non-fatal — the week panel just won't refresh until next load.
    }
  }

  const maxDone = weeks.reduce((a, w) => Math.max(a, w.week_number), 0);
  const activeWeek = weeks.find((w) => w.status === 'active');
  const canAdd = !activeWeek && maxDone < 16;
  const nextNum = maxDone + 1;

  async function startWeek() {
    if (!prefs) return;
    setCreating(true);
    setWeekError(null);
    try {
      const res = await fetch('/api/staff/attendance/weeks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: prefs.session, term: prefs.term, class_id: prefs.class_id, week_number: nextNum }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not start the week.');
      await refreshWeeks(prefs);
    } catch (e: any) {
      setWeekError(e?.message || 'Could not start the week.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-md p-5 border-l-4 border-brand-brown">
        <div className="flex justify-between items-center mb-3">
          <div className="font-bold text-sm text-brand-brown flex items-center gap-2">
            Academic Context
            {prefs && !editing && (
              <span className="text-[10px] font-bold uppercase tracking-wide bg-brand-cream text-brand-brown-light px-2 py-0.5 rounded-full">
                Auto-loaded
              </span>
            )}
          </div>
          {prefs && !editing && (
            <button type="button" className="text-xs font-medium text-brand-brown underline" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
        </div>

        {prefs && !editing ? (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))' }}>
            <div>
              <div className="text-[10px] text-brand-brown-light uppercase mb-0.5">Session</div>
              <div className="text-sm font-semibold text-brand-brown-dark">{prefs.session}</div>
            </div>
            <div>
              <div className="text-[10px] text-brand-brown-light uppercase mb-0.5">Term</div>
              <div className="text-sm font-semibold text-brand-brown-dark">{prefs.term}</div>
            </div>
            <div>
              <div className="text-[10px] text-brand-brown-light uppercase mb-0.5">Class</div>
              <div className="text-sm font-semibold text-brand-brown-dark">{savedClass ? classLabel(savedClass) : '—'}</div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[120px]">
              <label className="text-xs text-brand-brown-light block mb-1">Session</label>
              <select value={session} onChange={(e) => setSession(e.target.value)} className="border border-brand-cream-dark rounded-md px-3 py-2 text-sm w-full">
                {SESSIONS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[120px]">
              <label className="text-xs text-brand-brown-light block mb-1">Term</label>
              <select value={term} onChange={(e) => setTerm(e.target.value)} className="border border-brand-cream-dark rounded-md px-3 py-2 text-sm w-full">
                {TERMS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            {showClassPicker ? (
              <div className="flex-1 min-w-[150px]">
                <label className="text-xs text-brand-brown-light block mb-1">Class</label>
                <select value={classId} onChange={(e) => setClassId(e.target.value)} className="border border-brand-cream-dark rounded-md px-3 py-2 text-sm w-full">
                  <option value="">Select Class</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{classLabel(c)}</option>)}
                </select>
              </div>
            ) : (
              <input type="hidden" value={classId} />
            )}
            {saveError && <p className="text-danger-700 text-xs w-full">{saveError}</p>}
            <Button onClick={savePrefs} disabled={saving}>{saving ? 'Saving…' : 'Save Context'}</Button>
          </div>
        )}
      </div>

      {prefs && (
        <div className="bg-white rounded-md p-5">
          <div className="flex justify-between items-center flex-wrap gap-2 mb-4">
            <div className="font-bold text-sm text-brand-brown">
              Weeks — {prefs.session} · {prefs.term}
            </div>
            {canAdd && (
              <Button size="sm" onClick={startWeek} disabled={creating}>
                {creating ? 'Starting…' : `+ Start Week ${nextNum}`}
              </Button>
            )}
          </div>
          {weekError && <p className="text-danger-700 text-xs mb-2">{weekError}</p>}
          {weeks.length === 0 ? (
            <p className="text-brand-brown-light text-sm">No weeks started yet. Click "Start Week 1" above.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {weeks.map((w) => {
                const closed = w.status === 'closed';
                const active = w.status === 'active';
                return (
                  <div
                    key={w.id}
                    className={`cursor-pointer rounded-lg min-w-[82px] text-center px-3.5 py-2.5 border-2 ${
                      closed ? 'border-success-700 bg-success-soft' : active ? 'border-warning-700 bg-warning-soft' : 'border-brand-cream-dark bg-white'
                    }`}
                  >
                    <div className="font-bold text-sm text-brand-brown-dark">Wk {w.week_number}</div>
                    <div className={`text-[10px] font-bold mt-0.5 ${closed ? 'text-success-700' : active ? 'text-warning-700' : 'text-brand-brown-light'}`}>
                      {closed ? '✅ DONE' : active ? '🔓 ACTIVE' : '—'}
                    </div>
                    <div className="text-[9.5px] text-brand-brown-light mt-0.5">{(w.days_completed || []).length}/5 days</div>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-xs text-brand-brown-light mt-4">
            Day-by-day marking, week closing, and PDF/Excel export aren't migrated yet — this is where they'll attach next.
          </p>
        </div>
      )}
    </div>
  );
}
