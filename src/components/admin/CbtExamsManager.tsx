import { useState } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';

interface Exam {
  id: string;
  title: string;
  class_name: string | null;
  subject_name: string | null;
  duration_minutes: number | null;
  term: string | null;
  status: string;
  access_code: string | null;
}
interface ClassOption { id: string; name: string; arm: string | null }
interface SubjectOption { id: string; name: string }

interface Props {
  exams: Exam[];
  classes: ClassOption[];
  subjects: SubjectOption[];
}

const TERMS = ['1st Term', '2nd Term', '3rd Term'];
const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-brand-cream text-brand-brown-light',
  active: 'bg-success-700/10 text-success-700',
  completed: 'bg-info-700/10 text-info-700',
};

export default function CbtExamsManager({ exams, classes, subjects }: Props) {
  const [list, setList] = useState(exams);
  const [title, setTitle] = useState('');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [duration, setDuration] = useState('60');
  const [term, setTerm] = useState(TERMS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function callAPI(payload: object) {
    const res = await fetch('/api/admin/cbt/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed.');
    return data;
  }

  async function handleCreate() {
    if (!title.trim() || !classId || !subjectId) {
      setError('Title, class and subject are all required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const cls = classes.find((c) => c.id === classId);
      const subj = subjects.find((s) => s.id === subjectId);
      const data = await callAPI({
        action: 'create',
        title,
        classId,
        className: cls ? `${cls.name}${cls.arm ? ' ' + cls.arm : ''}` : undefined,
        subjectId,
        subjectName: subj?.name,
        durationMinutes: Number(duration) || 60,
        term,
      });
      setList((prev) => [data.exam, ...prev]);
      setTitle('');
      setClassId('');
      setSubjectId('');
      setDuration('60');
    } catch (e: any) {
      setError(e.message || 'Could not create exam.');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(id: string, status: string) {
    try {
      await callAPI({ action: 'setStatus', id, status });
      setList((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)));
    } catch (e: any) {
      alert(e.message || 'Could not update status.');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this exam?')) return;
    try {
      await callAPI({ action: 'delete', id });
      setList((prev) => prev.filter((e) => e.id !== id));
    } catch (e: any) {
      alert(e.message || 'Could not delete.');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-5 flex flex-col gap-3">
        <div className="font-heading font-bold text-brand-brown-dark">Create Exam</div>
        <div className="grid grid-cols-2 gap-3">
          <Input id="cbt-title" label="Exam Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Mid-Term Test" />
          <Select id="cbt-class" label="Class" placeholder="Select Class" options={classes.map((c) => ({ value: c.id, label: `${c.name}${c.arm ? ' ' + c.arm : ''}` }))} value={classId} onChange={(e) => setClassId(e.target.value)} />
          <Select id="cbt-subject" label="Subject" placeholder="Select Subject" options={subjects.map((s) => ({ value: s.id, label: s.name }))} value={subjectId} onChange={(e) => setSubjectId(e.target.value)} />
          <Input id="cbt-duration" label="Duration (minutes)" type="number" value={duration} onChange={(e) => setDuration(e.target.value)} />
          <Select id="cbt-term" label="Term" options={TERMS.map((t) => ({ value: t, label: t }))} value={term} onChange={(e) => setTerm(e.target.value)} />
        </div>
        {error && <div className="text-sm text-danger-700">{error}</div>}
        <Button variant="primary" onClick={handleCreate} disabled={saving} className="self-start">
          {saving ? 'Creating…' : 'Create Exam'}
        </Button>
      </div>

      <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-brand-cream text-xs uppercase text-brand-brown-light">
            <tr>
              <th className="text-left px-4 py-2.5">Exam</th>
              <th className="text-left px-4 py-2.5">Class</th>
              <th className="text-left px-4 py-2.5">Subject</th>
              <th className="text-left px-4 py-2.5">Status</th>
              <th className="text-left px-4 py-2.5">Access Code</th>
              <th className="text-left px-4 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center px-4 py-8 text-brand-brown-light">
                  No exams yet — create one above.
                </td>
              </tr>
            )}
            {list.map((e) => (
              <tr key={e.id} className="border-t border-brand-cream-dark">
                <td className="px-4 py-2.5 font-medium text-brand-brown-dark">{e.title}</td>
                <td className="px-4 py-2.5">{e.class_name || '—'}</td>
                <td className="px-4 py-2.5">{e.subject_name || '—'}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[e.status] || STATUS_STYLE.draft}`}>{e.status}</span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">{e.access_code || '—'}</td>
                <td className="px-4 py-2.5 flex gap-3">
                  {e.status !== 'active' && (
                    <button onClick={() => handleStatus(e.id, 'active')} className="text-success-700 hover:underline">
                      Activate
                    </button>
                  )}
                  {e.status === 'active' && (
                    <button onClick={() => handleStatus(e.id, 'completed')} className="text-info-700 hover:underline">
                      Close
                    </button>
                  )}
                  <button onClick={() => handleDelete(e.id)} className="text-danger-700 hover:underline">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
