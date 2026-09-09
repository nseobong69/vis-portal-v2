import { useMemo, useState } from 'react';
import Button from '../ui/Button';

interface ClassOption { id: string; label: string; level?: string }
interface StudentLite { id: string; class_id: string | null; full_name: string; admission_number: string | null; student_type: string | null }

interface Props {
  classes: ClassOption[];
  students: StudentLite[];
  onClose: () => void;
  onDone: () => void;
}

export default function TransferStudentsModal({ classes, students, onClose, onDone }: Props) {
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [mode, setMode] = useState<'selected' | 'all'>('selected');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [newTypes, setNewTypes] = useState<Record<string, 'old' | 'new'>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: number; errs: number } | null>(null);
  const [error, setError] = useState('');

  const fromStudents = useMemo(() => students.filter((s) => s.class_id === fromId), [students, fromId]);
  const toClass = classes.find((c) => c.id === toId);

  function pickFrom(id: string) {
    setFromId(id);
    const all = new Set(students.filter((s) => s.class_id === id).map((s) => s.id));
    setChecked(mode === 'all' ? all : all); // selected mode still starts fully checked, same as old app
    const types: Record<string, 'old' | 'new'> = {};
    students.filter((s) => s.class_id === id).forEach((s) => { types[s.id] = (s.student_type as 'old' | 'new') || 'old'; });
    setNewTypes(types);
  }

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function execute() {
    setError('');
    if (!fromId) { setError('Select source class.'); return; }
    if (!toId) { setError('Select destination class.'); return; }
    if (fromId === toId) { setError('Source and destination class are the same.'); return; }
    const selected = mode === 'all' ? fromStudents.map((s) => s.id) : [...checked];
    if (!selected.length) { setError('No students selected.'); return; }

    setRunning(true);
    try {
      const res = await fetch('/api/admin/students/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toClassId: toId,
          toClassName: toClass?.label || '',
          students: selected.map((id) => ({ id, newType: newTypes[id] || 'old' })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Transfer failed.');
      setResult(data);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transfer failed.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-lg max-w-[700px] w-full p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold text-xl text-brand-brown-dark">⇄ Transfer Students</h3>
          <button onClick={onClose} className="text-2xl text-brand-brown-light leading-none">&times;</button>
        </div>
        <p className="text-xs bg-blue-50 text-blue-800 rounded-md px-3 py-2">
          Use for class promotions or demotions. All student records (results, fees, attendance, dashboard) will reflect the new class automatically.
        </p>

        <div className="grid grid-cols-2 gap-3.5">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-brand-brown-dark">From Class (Source)</label>
            <select value={fromId} onChange={(e) => pickFrom(e.target.value)} className="font-body text-sm rounded-sm border border-brand-cream-dark px-3 py-2 bg-white">
              <option value="">— Select source class —</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.label} ({c.level || '?'})</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-brand-brown-dark">To Class (Destination)</label>
            <select value={toId} onChange={(e) => setToId(e.target.value)} className="font-body text-sm rounded-sm border border-brand-cream-dark px-3 py-2 bg-white">
              <option value="">— Select destination class —</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.label} ({c.level || '?'})</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-brand-brown-dark">Transfer Type</label>
          <div className="flex gap-4 mt-1.5">
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="radio" checked={mode === 'selected'} onChange={() => setMode('selected')} /> Selected Students Only
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="radio" checked={mode === 'all'} onChange={() => setMode('all')} /> All Students in Class
            </label>
          </div>
        </div>

        <div className="border border-brand-cream-dark rounded-lg max-h-[300px] overflow-y-auto">
          {!fromId ? (
            <div className="text-center py-8 text-brand-brown-light text-sm">↑ Select a source class above</div>
          ) : fromStudents.length === 0 ? (
            <div className="p-5 text-brand-brown-light text-sm">No students in this class.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-brand-cream text-left text-xs">
                  <th className="p-2 w-9"></th>
                  <th className="p-2">Student / Pupil</th>
                  <th className="p-2">Adm No</th>
                  <th className="p-2">Status After Transfer</th>
                </tr>
              </thead>
              <tbody>
                {fromStudents.map((s) => (
                  <tr key={s.id}>
                    <td className="p-2">
                      <input type="checkbox" checked={mode === 'all' || checked.has(s.id)} disabled={mode === 'all'} onChange={() => toggle(s.id)} />
                    </td>
                    <td className="p-2 font-semibold">{s.full_name}</td>
                    <td className="p-2 text-xs text-brand-brown-light">{s.admission_number || '—'}</td>
                    <td className="p-2">
                      <select
                        value={newTypes[s.id] || 'old'}
                        onChange={(e) => setNewTypes((prev) => ({ ...prev, [s.id]: e.target.value as 'old' | 'new' }))}
                        className="text-xs rounded-sm border border-brand-cream-dark px-2 py-1"
                      >
                        <option value="old">↩ Old Student</option>
                        <option value="new">✦ New Student</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2.5">
          <span className="text-sm text-brand-brown-light">
            {fromId ? `${mode === 'all' ? fromStudents.length : checked.size} of ${fromStudents.length} students selected for transfer` : ''}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="button" variant="gold" onClick={execute} disabled={running}>
              {running ? 'Transferring…' : '⇄ Execute Transfer'}
            </Button>
          </div>
        </div>

        {error && <p className="text-sm text-danger-700">{error}</p>}
        {result && (
          <p className={`text-sm ${result.errs ? 'text-amber-700' : 'text-success-700'}`}>
            {result.errs ? `⚠ ${result.ok} transferred, ${result.errs} failed.` : `✅ ${result.ok} student${result.ok !== 1 ? 's' : ''} transferred.`}
          </p>
        )}
      </div>
    </div>
  );
}
