import { useState } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';

interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: string | null;
  class_id: string | null;
  class_name: string | null;
  author: string | null;
  author_id: string | null;
  created_at: string;
}
interface ClassOption { id: string; name: string; arm: string | null }

interface Props {
  announcements: Announcement[];
  classes: ClassOption[];
  role: string;
  userId: string;
  canPost: boolean;
  canSeeAll: boolean;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export default function AnnouncementsManager({ announcements, classes, role, userId, canPost, canSeeAll }: Props) {
  const [list, setList] = useState(announcements);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'all' | 'students' | 'staff' | 'class'>('all');
  const [classId, setClassId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isSubjectTeacher = role === 'subject_teacher';
  const classOptions = classes.map((c) => ({ value: c.id, label: `${c.name}${c.arm ? ' ' + c.arm : ''}` }));
  const selectedClass = classes.find((c) => c.id === classId);

  async function callAPI(payload: object) {
    const res = await fetch('/api/admin/announcements/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed.');
    return data;
  }

  async function handlePost() {
    if (!title.trim() || !body.trim()) {
      setError('Title and message are both required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const data = await callAPI({
        action: 'create',
        title,
        body,
        audience: isSubjectTeacher ? 'class' : audience,
        classId: audience === 'class' ? classId : undefined,
        className: audience === 'class' && selectedClass ? `${selectedClass.name}${selectedClass.arm ? ' ' + selectedClass.arm : ''}` : undefined,
      });
      setList((prev) => [data.announcement, ...prev]);
      setTitle('');
      setBody('');
      setClassId('');
    } catch (e: any) {
      setError(e.message || 'Could not post announcement.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this announcement?')) return;
    try {
      await callAPI({ action: 'delete', id });
      setList((prev) => prev.filter((a) => a.id !== id));
    } catch (e: any) {
      alert(e.message || 'Could not delete.');
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-[760px]">
      {canPost && (
        <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-5 flex flex-col gap-3">
          <div className="font-heading font-bold text-brand-brown-dark">Post Announcement</div>
          <Input id="ann-title" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Announcement title" />
          <div className="flex flex-col gap-1">
            <label htmlFor="ann-body" className="text-sm font-body font-medium text-brand-brown-dark">
              Message
            </label>
            <textarea
              id="ann-body"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your announcement here…"
              className="font-body text-sm text-body rounded-sm border border-brand-cream-dark px-3 py-2 bg-white resize-y focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold"
            />
          </div>
          {!isSubjectTeacher ? (
            <div className="grid grid-cols-2 gap-3">
              <Select
                id="ann-audience"
                label="Send To"
                options={[
                  { value: 'all', label: 'All (Students, Staff)' },
                  { value: 'students', label: 'Students Only' },
                  { value: 'staff', label: 'Staff Only' },
                  { value: 'class', label: 'Specific Class' },
                ]}
                value={audience}
                onChange={(e) => setAudience(e.target.value as any)}
              />
              {audience === 'class' && (
                <Select id="ann-class" label="Class" placeholder="Select Class" options={classOptions} value={classId} onChange={(e) => setClassId(e.target.value)} />
              )}
            </div>
          ) : (
            <div className="text-xs text-brand-brown-light">Sends to: My Class Only</div>
          )}
          {error && <div className="text-sm text-danger-700">{error}</div>}
          <Button variant="primary" onClick={handlePost} disabled={saving}>
            {saving ? 'Posting…' : 'Post Announcement'}
          </Button>
        </div>
      )}

      {list.length === 0 && (
        <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-9 text-center text-brand-brown-light">
          No announcements yet.
        </div>
      )}

      {list.map((a) => (
        <div key={a.id} className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-5">
          <div className="flex justify-between items-start gap-3 flex-wrap mb-2">
            <div className="font-heading font-bold text-brand-brown-dark">{a.title || 'Announcement'}</div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase bg-brand-cream text-brand-brown-light rounded px-2 py-0.5">
                {(a.audience || 'all').toUpperCase()}
              </span>
              {a.class_id && <span className="text-[10px] font-bold uppercase bg-info-700/10 text-info-700 rounded px-2 py-0.5">CLASS</span>}
              {(canSeeAll || a.author_id === userId) && (
                <button onClick={() => handleDelete(a.id)} className="text-danger-700 text-xs hover:underline">
                  Delete
                </button>
              )}
            </div>
          </div>
          <p className="text-sm text-body leading-relaxed">{a.body}</p>
          <div className="mt-2 text-xs text-brand-brown-light">
            {a.author || 'Admin'} · {fmtDate(a.created_at)}
          </div>
        </div>
      ))}
    </div>
  );
}
