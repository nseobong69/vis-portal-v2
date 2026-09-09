import { useState } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';

const PRESET_NAMES = [
  'Kindergarten Lower', 'Kindergarten Upper', 'Nursery 1', 'Nursery 2',
  'Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6',
  'JSS 1', 'JSS 2', 'JSS 3', 'SSS 1', 'SSS 2', 'SSS 3',
];

interface Teacher { id: string; full_name: string }
interface ClassRow {
  id: string;
  name: string;
  arm?: string;
  level?: string;
  class_teacher_id?: string | null;
  profiles?: { full_name: string } | null;
}

interface Props {
  classes: ClassRow[];
  teachers: Teacher[];
}

function AddClassModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [custom, setCustom] = useState('');
  const [arm, setArm] = useState('');
  const [level, setLevel] = useState('kindergarten');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const finalName = name === '__custom__' ? custom.trim() : name;
    if (!finalName) { setError('Select a class or enter a custom name.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/classes/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', name: finalName, arm, level }),
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
      <div className="bg-white rounded-lg max-w-[480px] w-full p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold text-xl text-brand-brown-dark">Create New Class</h3>
          <button onClick={onClose} className="text-2xl text-brand-brown-light leading-none">&times;</button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-brand-brown-dark">Class Name</label>
            <select value={name} onChange={(e) => setName(e.target.value)} className="font-body text-sm rounded-sm border border-brand-cream-dark px-3 py-2 bg-white">
              <option value="">Select Class</option>
              {PRESET_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
              <option value="__custom__">➕ Other (type custom name below)</option>
            </select>
          </div>
          {name === '__custom__' && (
            <Input id="nc-custom" label="Custom Class Name" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. Pre-Nursery, SSS 4, Reception" />
          )}
          <Input id="nc-arm" label="Arm (optional)" value={arm} onChange={(e) => setArm(e.target.value)} placeholder="e.g. A, B, Gold" />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-brand-brown-dark">Level</label>
            <select value={level} onChange={(e) => setLevel(e.target.value)} className="font-body text-sm rounded-sm border border-brand-cream-dark px-3 py-2 bg-white">
              <option value="kindergarten">Kindergarten</option>
              <option value="nursery">Nursery</option>
              <option value="primary">Primary</option>
              <option value="secondary">Secondary</option>
            </select>
          </div>
          {error && <p className="text-sm text-danger-700">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button type="submit" variant="gold" disabled={saving} className="flex-1 justify-center">{saving ? 'Creating…' : 'Create Class'}</Button>
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditClassModal({ cls, teachers, onClose, onSaved }: { cls: ClassRow; teachers: Teacher[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(cls.name);
  const [arm, setArm] = useState(cls.arm || '');
  const [teacherId, setTeacherId] = useState(cls.class_teacher_id || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/classes/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: cls.id, name, arm, class_teacher_id: teacherId || null }),
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
      <div className="bg-white rounded-lg max-w-[480px] w-full p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold text-xl text-brand-brown-dark">Edit Class</h3>
          <button onClick={onClose} className="text-2xl text-brand-brown-light leading-none">&times;</button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Input id="ec-name" label="Class Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input id="ec-arm" label="Arm" value={arm} onChange={(e) => setArm(e.target.value)} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-brand-brown-dark">Class Teacher</label>
            <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="font-body text-sm rounded-sm border border-brand-cream-dark px-3 py-2 bg-white">
              <option value="">Not assigned</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          </div>
          {error && <p className="text-sm text-danger-700">{error}</p>}
          <Button type="submit" variant="gold" disabled={saving} className="w-full justify-center mt-1">{saving ? 'Saving…' : 'Save Changes'}</Button>
        </form>
      </div>
    </div>
  );
}

export default function ClassesManager({ classes, teachers }: Props) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ClassRow | null>(null);

  async function del(c: ClassRow) {
    if (!confirm('Delete this class?')) return;
    await fetch('/api/admin/classes/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id: c.id }),
    });
    window.location.reload();
  }

  if (!classes.length) {
    return (
      <div className="bg-white rounded-lg border border-brand-cream-dark p-9 text-center flex flex-col items-center gap-3">
        <span className="text-3xl">🏫</span>
        <div className="font-heading font-bold text-brand-brown-dark">No classes yet</div>
        <Button type="button" variant="gold" onClick={() => setAdding(true)}>+ Create First Class</Button>
        {adding && <AddClassModal onClose={() => setAdding(false)} onSaved={() => window.location.reload()} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button type="button" variant="gold" onClick={() => setAdding(true)}>+ New Class</Button>
      </div>
      <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        {classes.map((c) => (
          <div key={c.id} className="bg-white rounded-lg border border-brand-cream-dark p-4.5 p-4">
            <div className="flex justify-between items-start mb-2.5">
              <div>
                <div className="font-heading font-bold text-brand-brown-dark text-[17px]">{c.name}{c.arm ? ` ${c.arm}` : ''}</div>
                <div className="text-xs text-brand-brown-light">Teacher: {c.profiles?.full_name || 'Not assigned'}</div>
              </div>
              <div className="w-9 h-9 rounded-md bg-brand-cream flex items-center justify-center text-lg">🏫</div>
            </div>
            <div className="flex gap-1.5 mt-3">
              <a href={`/admin/students?class=${c.id}`} className="flex-1 text-center text-xs px-2 py-1.5 rounded-sm border border-brand-cream-dark hover:bg-brand-cream">👥 Students</a>
              <button onClick={() => setEditing(c)} className="text-xs px-2 py-1.5 rounded-sm border border-brand-cream-dark hover:bg-brand-cream" title="Edit">✏️</button>
              <button onClick={() => del(c)} className="text-xs px-2 py-1.5 rounded-sm bg-danger-700 text-white" title="Delete">🗑️</button>
            </div>
          </div>
        ))}
      </div>
      {adding && <AddClassModal onClose={() => setAdding(false)} onSaved={() => window.location.reload()} />}
      {editing && <EditClassModal cls={editing} teachers={teachers} onClose={() => setEditing(null)} onSaved={() => window.location.reload()} />}
    </div>
  );
}
