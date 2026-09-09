import { useState } from 'react';
import Button from '../ui/Button';

interface SubjectRow { id: string; name: string; code?: string | null }
interface ClassOption { id: string; label: string }
interface AssignedRow { id: string; subjects: { name: string; code?: string | null } | null }

interface Props {
  subjects: SubjectRow[];
  classes: ClassOption[];
}

function BulkAddModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState(() => Array.from({ length: 40 }, () => ({ name: '', code: '' })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function setRow(i: number, patch: Partial<{ name: string; code: string }>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function submit() {
    const names = rows.map((r) => r.name.trim()).filter(Boolean);
    if (!names.length) { setError('Enter at least one subject name.'); return; }
    const codes = rows.filter((r) => r.name.trim()).map((r) => r.code.trim().toUpperCase());
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/subjects/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_bulk', names, codes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Save failed.');
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-lg max-w-[560px] w-full p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold text-xl text-brand-brown-dark">Add Subjects (Bulk)</h3>
          <button onClick={onClose} className="text-2xl text-brand-brown-light leading-none">&times;</button>
        </div>
        <p className="text-xs bg-amber-50 text-amber-800 rounded-md px-3 py-2">
          Fill as many boxes as needed. Empty rows are ignored automatically.
        </p>
        <div className="max-h-[55vh] overflow-y-auto pr-1.5 flex flex-col gap-1.5">
          <div className="grid gap-2 text-xs font-medium text-brand-brown-dark" style={{ gridTemplateColumns: '1fr 100px' }}>
            <span>Subject Name</span><span>Code</span>
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid gap-2" style={{ gridTemplateColumns: '1fr 100px' }}>
              <input
                value={r.name}
                onChange={(e) => setRow(i, { name: e.target.value })}
                placeholder={`Subject Name ${i + 1}`}
                className="text-sm rounded-sm border border-brand-cream-dark px-2.5 py-2"
              />
              <input
                value={r.code}
                onChange={(e) => setRow(i, { code: e.target.value.toUpperCase() })}
                placeholder="Code"
                className="text-sm rounded-sm border border-brand-cream-dark px-2.5 py-2 uppercase"
              />
            </div>
          ))}
        </div>
        {error && <p className="text-sm text-danger-700">{error}</p>}
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="gold" disabled={saving} onClick={submit} className="flex-1 justify-center">
            {saving ? 'Adding…' : '+ Add All Subjects'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

export default function SubjectsManager({ subjects, classes }: Props) {
  const [adding, setAdding] = useState(false);
  const [classId, setClassId] = useState('');
  const [assigned, setAssigned] = useState<AssignedRow[] | null>(null);
  const [loadingAssigned, setLoadingAssigned] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState('');

  async function loadClassSubjects(cid: string) {
    setClassId(cid);
    setAssigned(null);
    if (!cid) return;
    setLoadingAssigned(true);
    const res = await fetch('/api/admin/subjects/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_class_subjects', classId: cid }),
    });
    const data = await res.json();
    setAssigned(res.ok ? data.rows : []);
    setLoadingAssigned(false);
  }

  async function assign() {
    if (!classId) { setStatus('Select a class.'); return; }
    if (!selected.length) { setStatus('Select at least one subject.'); return; }
    const res = await fetch('/api/admin/subjects/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'assign', classId, subjectIds: selected }),
    });
    const data = await res.json();
    if (!res.ok) { setStatus(data?.error || 'Failed.'); return; }
    setStatus(data.added ? `✅ ${data.added} subject${data.added > 1 ? 's' : ''} assigned!${data.skipped ? ` (${data.skipped} already existed)` : ''}` : 'All selected subjects were already assigned.');
    loadClassSubjects(classId);
  }

  async function unassign(id: string) {
    await fetch('/api/admin/subjects/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unassign', id }),
    });
    loadClassSubjects(classId);
  }

  async function del(s: SubjectRow) {
    if (!confirm('Delete this subject?')) return;
    await fetch('/api/admin/subjects/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id: s.id }),
    });
    window.location.reload();
  }

  return (
    <div className="grid grid-cols-2 gap-4.5 gap-4">
      <div className="bg-white rounded-lg border border-brand-cream-dark overflow-hidden">
        <div className="p-3.5 border-b border-brand-cream-dark font-heading font-bold text-sm text-brand-brown-dark flex justify-between items-center">
          <span>All Subjects ({subjects.length})</span>
          <Button type="button" size="sm" variant="gold" onClick={() => setAdding(true)}>+ Add Subject</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-brand-brown-light border-b border-brand-cream-dark">
                <th className="px-4 py-2">Code</th><th className="px-4 py-2">Subject</th><th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {subjects.length === 0 && (
                <tr><td colSpan={3} className="text-center py-7 text-brand-brown-light">No subjects yet.</td></tr>
              )}
              {subjects.map((s) => (
                <tr key={s.id} className="border-b border-brand-cream-dark last:border-0">
                  <td className="px-4 py-2"><span className="text-[10.5px] rounded-full px-1.5 py-0.5 bg-brand-cream">{s.code || '—'}</span></td>
                  <td className="px-4 py-2 font-semibold">{s.name}</td>
                  <td className="px-4 py-2">
                    <button onClick={() => del(s)} className="text-xs px-2 py-1 rounded-sm bg-danger-700 text-white">🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-brand-cream-dark p-5 flex flex-col gap-3.5">
        <div className="font-heading font-bold text-sm text-brand-brown-dark">Assign Subjects to Class</div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-brand-brown-dark">Class</label>
          <select value={classId} onChange={(e) => loadClassSubjects(e.target.value)} className="text-sm rounded-sm border border-brand-cream-dark px-3 py-2">
            <option value="">Select class</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="text-sm font-medium text-brand-brown-dark">Subjects <span className="text-xs font-normal text-brand-brown-light">(hold Ctrl/⌘ to select multiple)</span></label>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setSelected(subjects.map((s) => s.id))} className="text-[11px] px-1.5 py-0.5 rounded-sm hover:bg-brand-cream">All</button>
              <button type="button" onClick={() => setSelected([])} className="text-[11px] px-1.5 py-0.5 rounded-sm hover:bg-brand-cream">None</button>
            </div>
          </div>
          <select
            multiple
            value={selected}
            onChange={(e) => setSelected(Array.from(e.target.selectedOptions).map((o) => o.value))}
            className="w-full text-sm rounded-sm border border-brand-cream-dark px-3 py-2"
            style={{ height: 160 }}
          >
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ''}</option>)}
          </select>
        </div>
        <Button type="button" variant="primary" onClick={assign}>🔗 Assign Selected</Button>
        {status && <p className="text-xs text-brand-brown-light">{status}</p>}

        <div className="mt-2">
          <div className="font-heading font-bold text-[13.5px] text-brand-brown-dark mb-2">Assigned Subjects</div>
          {!classId && <p className="text-brand-brown-light text-sm">Select a class above.</p>}
          {loadingAssigned && <p className="text-brand-brown-light text-sm">Loading…</p>}
          {assigned && assigned.length === 0 && <p className="text-brand-brown-light text-sm">No subjects assigned.</p>}
          {assigned && assigned.map((cs) => (
            <div key={cs.id} className="flex justify-between items-center py-1.5 border-b border-brand-cream-dark last:border-0">
              <span className="text-sm text-brand-brown-dark">{cs.subjects?.name || '—'}</span>
              <button onClick={() => unassign(cs.id)} className="text-xs px-2 py-1 rounded-sm bg-danger-700 text-white">✕</button>
            </div>
          ))}
        </div>
      </div>

      {adding && <BulkAddModal onClose={() => setAdding(false)} onSaved={() => window.location.reload()} />}
    </div>
  );
}
