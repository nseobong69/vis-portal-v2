import { useEffect, useState } from 'react';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Select from '../ui/Select';
import Input from '../ui/Input';
import AILessonModal from './AILessonModal';

interface ClassOption { id: string; name: string; arm: string | null }
interface AcadItem {
  id: string; title: string; class_name: string; subject_name: string;
  content?: string; image_url?: string; video_url?: string;
  submission_date?: string; type?: string; max_score?: number;
  term: string; session: string; created_at: string;
}

const TERMS = ['1st Term', '2nd Term', '3rd Term'];
const SESSIONS = ['2024/2025', '2025/2026', '2026/2027', '2027/2028', '2028/2029'];

async function callAPI(payload: object) {
  const res = await fetch('/api/admin/academics/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Ports showCreateAcademicModal()/loadAcadSubjects()/saveAcademicItem() */
function CreateModal({ type, classes, onClose, onSaved }: { type: 'assignment' | 'note' | 'video'; classes: ClassOption[]; onClose: () => void; onSaved: () => void }) {
  const isVideo = type === 'video';
  const isAssignment = type === 'assignment';
  const typeLabel = isVideo ? 'Class Video' : isAssignment ? 'Assignment / Homework / Project' : 'Lesson Note';

  const [classId, setClassId] = useState('');
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [term, setTerm] = useState(TERMS[0]);
  const [session, setSession] = useState(SESSIONS[1]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [subDate, setSubDate] = useState('');
  const [assignType, setAssignType] = useState('assignment');
  const [maxScore, setMaxScore] = useState('100');
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  async function loadSubjects(id: string) {
    setClassId(id);
    setSubjectId('');
    setSubjects([]);
    if (!id) return;
    try {
      const data = await callAPI({ action: 'subjectsForClass', classId: id });
      setSubjects(data.subjects || []);
    } catch { /* non-fatal, dropdown stays empty */ }
  }

  async function uploadToCloudinary(file: File, purpose: 'video' | 'image'): Promise<string> {
    const sig = await callAPI({ action: 'signUpload', purpose });
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', sig.folder);
    fd.append('public_id', sig.public_id);
    fd.append('api_key', sig.api_key);
    fd.append('signature', sig.signature);
    fd.append('timestamp', String(sig.timestamp));
    const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloud_name}/${sig.resourceType}/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.secure_url as string;
  }

  async function submit() {
    if (!classId || !title.trim()) {
      setError('Class and title are required.');
      return;
    }
    if (isVideo && !videoFile) {
      setError('Select a video file.');
      return;
    }
    setSaving(true);
    setError('');
    const cls = classes.find((c) => c.id === classId);
    const className = cls ? `${cls.name}${cls.arm ? ' ' + cls.arm : ''}` : '';
    const subjectName = subjects.find((s) => s.id === subjectId)?.name || '';
    try {
      const payload: Record<string, any> = { class_id: classId, class_name: className, subject_id: subjectId || null, subject_name: subjectName, title, term, session };
      if (isVideo) {
        setProgress('Uploading video… please wait');
        payload.video_url = await uploadToCloudinary(videoFile!, 'video');
      } else {
        payload.content = content.trim();
        if (imageFile) {
          setProgress('Uploading image…');
          try { payload.image_url = await uploadToCloudinary(imageFile, 'image'); } catch { /* non-fatal, same as old app */ }
        }
        if (isAssignment) {
          payload.submission_date = subDate || null;
          payload.assignment_type = assignType;
          payload.max_score = Number(maxScore) || 100;
        }
      }
      setProgress('Publishing…');
      await callAPI({ action: 'create', type, payload });
      onSaved();
    } catch (e: any) {
      setError(e.message || 'Could not publish.');
    } finally {
      setSaving(false);
      setProgress('');
    }
  }

  return (
    <Modal open onClose={onClose} title={`Create ${typeLabel}`}>
      <div className="flex flex-col gap-3 min-w-[280px] max-w-[520px]">
        <div className="grid grid-cols-2 gap-3">
          <Select id="acm-class" label="Class" placeholder="Select Class" value={classId} onChange={(e) => loadSubjects(e.target.value)}
            options={classes.map((c) => ({ value: c.id, label: `${c.name}${c.arm ? ' ' + c.arm : ''}` }))} />
          <Select id="acm-subject" label="Subject" placeholder={classId ? 'Select Subject' : 'Select class first'} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}
            options={subjects.map((s) => ({ value: s.id, label: s.name }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select id="acm-term" label="Term" value={term} onChange={(e) => setTerm(e.target.value)} options={TERMS.map((t) => ({ value: t, label: t }))} />
          <Select id="acm-session" label="Session" value={session} onChange={(e) => setSession(e.target.value)} options={SESSIONS.map((s) => ({ value: s, label: s }))} />
        </div>
        <Input id="acm-title" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter title…" />

        {isVideo ? (
          <div>
            <div className="bg-[#EDE9FE] rounded-lg px-3.5 py-3 text-xs text-[#5D4037] mb-2">
              <strong className="text-[#7C3AED]">ℹ️ Video Upload</strong> — stored via Cloudinary and auto-optimised.
            </div>
            <label className="text-sm font-medium text-brand-brown-dark block mb-1">Select Video File</label>
            <input type="file" accept="video/*" onChange={(e) => setVideoFile(e.target.files?.[0] || null)} className="text-sm" />
          </div>
        ) : (
          <>
            <div>
              <label className="text-sm font-medium text-brand-brown-dark block mb-1">Content (max 50,000 characters)</label>
              <textarea className="w-full rounded border border-brand-cream-dark px-3 py-2 text-sm" rows={6} maxLength={50000} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Write content here…" />
            </div>
            <div>
              <label className="text-sm font-medium text-brand-brown-dark block mb-1">Image (optional)</label>
              <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} className="text-sm" />
            </div>
          </>
        )}

        {isAssignment && (
          <div className="grid grid-cols-2 gap-3">
            <Input id="acm-subdate" label="Submission Date" type="date" value={subDate} onChange={(e) => setSubDate(e.target.value)} />
            <Select id="acm-type" label="Type" value={assignType} onChange={(e) => setAssignType(e.target.value)}
              options={[{ value: 'assignment', label: 'Assignment' }, { value: 'homework', label: 'Homework' }, { value: 'project', label: 'Project' }]} />
            <Input id="acm-maxscore" label="Max Score" type="number" min={1} value={maxScore} onChange={(e) => setMaxScore(e.target.value)} />
          </div>
        )}

        {progress && <div className="text-xs text-[#7C3AED] font-semibold">⏳ {progress}</div>}
        {error && <div className="text-sm text-danger-700">{error}</div>}
        <div className="flex gap-2 mt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={saving} className="flex-1">{saving ? 'Publishing…' : '📤 Publish'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function EmptyState({ icon, label, cta, onCreate }: { icon: string; label: string; cta: string; onCreate: () => void }) {
  return (
    <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm text-center py-10">
      <div className="text-3xl mb-3">{icon}</div>
      <div className="font-bold text-brand-brown-dark mb-3">{label}</div>
      <Button variant="primary" onClick={onCreate}>{cta}</Button>
    </div>
  );
}

export default function AcademicsManager({ classes }: { classes: ClassOption[] }) {
  const [tab, setTab] = useState<0 | 1 | 2>(0);
  const [assignments, setAssignments] = useState<AcadItem[]>([]);
  const [notes, setNotes] = useState<AcadItem[]>([]);
  const [videos, setVideos] = useState<AcadItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [createType, setCreateType] = useState<'assignment' | 'note' | 'video' | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await callAPI({ action: 'list' });
      setAssignments(data.assignments || []);
      setNotes(data.notes || []);
      setVideos(data.videos || []);
      const ids = (data.assignments || []).map((a: AcadItem) => a.id);
      if (ids.length) {
        const c = await callAPI({ action: 'submissionCounts', assignmentIds: ids });
        setCounts(c.counts || {});
      }
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function del(table: string, id: string) {
    if (!confirm('Delete this item?')) return;
    await callAPI({ action: 'delete', table, id });
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => setCreateType('assignment')}>+ Assignment</Button>
        <Button variant="secondary" onClick={() => setCreateType('note')}>+ Lesson Note</Button>
        <button onClick={() => setAiOpen(true)} className="text-sm font-semibold px-3 py-2 rounded-md text-white" style={{ background: 'linear-gradient(135deg,#7C3AED,#5D4037)' }}>🤖 AI Generate</button>
        <button onClick={() => setCreateType('video')} className="text-sm font-semibold px-3 py-2 rounded-md text-white" style={{ background: '#7C3AED' }}>🎥 Upload Video</button>
      </div>

      <div className="flex gap-1 bg-brand-cream rounded-xl p-1 w-fit flex-wrap">
        {[`Assignments (${assignments.length})`, `Lesson Notes (${notes.length})`, `Videos (${videos.length})`].map((label, i) => (
          <button key={label} onClick={() => setTab(i as 0 | 1 | 2)} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === i ? 'bg-brand-brown text-white' : 'text-brand-brown-dark'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-10 text-brand-brown-light text-sm">Loading…</div>
      ) : tab === 0 ? (
        assignments.length === 0 ? <EmptyState icon="👥" label="No assignments yet" cta="Create Assignment" onCreate={() => setCreateType('assignment')} /> : (
          <div className="flex flex-col gap-3">
            {assignments.map((a) => (
              <div key={a.id} className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-4">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1">
                    <div className="font-bold text-brand-brown-dark">{a.title}</div>
                    <div className="text-xs text-brand-brown-light mb-1.5">{a.class_name || '—'} · {a.subject_name || '—'} · <span className="border border-brand-cream-dark rounded px-1.5 py-0.5">{a.type || 'assignment'}</span></div>
                    <div className="text-sm text-brand-brown-dark whitespace-pre-wrap line-clamp-4">{(a.content || '').slice(0, 300)}{(a.content || '').length > 300 ? '…' : ''}</div>
                    {a.image_url && <img src={a.image_url} className="max-w-[200px] rounded-lg mt-2 border border-brand-cream-dark" />}
                    {a.submission_date && <div className="text-[11.5px] font-semibold text-danger-700 mt-2">📅 Due: {fmtDate(a.submission_date)}</div>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold px-2 py-1 rounded-md bg-brand-cream text-brand-brown-dark whitespace-nowrap" title="View Submissions — review UI not built yet">📥 {counts[a.id] ?? '…'}</span>
                    <button onClick={() => del('academic_assignments', a.id)} className="text-xs px-2 py-1 rounded-md bg-danger-700 text-white">🗑️</button>
                  </div>
                </div>
                <div className="text-[11px] text-brand-brown-light mt-2">{a.term} · {a.session} · {fmtDate(a.created_at)}</div>
              </div>
            ))}
          </div>
        )
      ) : tab === 1 ? (
        notes.length === 0 ? <EmptyState icon="📖" label="No lesson notes yet" cta="Create Note" onCreate={() => setCreateType('note')} /> : (
          <div className="flex flex-col gap-3">
            {notes.map((n) => (
              <div key={n.id} className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-4">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1">
                    <div className="font-bold text-brand-brown-dark">{n.title}</div>
                    <div className="text-xs text-brand-brown-light mb-1.5">{n.class_name || '—'} · {n.subject_name || '—'}</div>
                    <div className="text-sm text-brand-brown-dark whitespace-pre-wrap line-clamp-4">{(n.content || '').slice(0, 300)}{(n.content || '').length > 300 ? '…' : ''}</div>
                    {n.image_url && <img src={n.image_url} className="max-w-[200px] rounded-lg mt-2 border border-brand-cream-dark" />}
                  </div>
                  <button onClick={() => del('academic_notes', n.id)} className="text-xs px-2 py-1 rounded-md bg-danger-700 text-white h-fit">🗑️</button>
                </div>
                <div className="text-[11px] text-brand-brown-light mt-2">{n.term} · {n.session} · {fmtDate(n.created_at)}</div>
              </div>
            ))}
          </div>
        )
      ) : (
        videos.length === 0 ? <EmptyState icon="🎬" label="No videos uploaded yet" cta="Upload Video" onCreate={() => setCreateType('video')} /> : (
          <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {videos.map((v) => (
              <div key={v.id} className="bg-white rounded-lg border border-brand-cream-dark shadow-sm overflow-hidden">
                <div className="bg-black aspect-video">
                  {v.video_url ? <video src={v.video_url} controls playsInline className="w-full h-full object-contain" /> : <div className="w-full h-full flex items-center justify-center text-white text-2xl">🎥</div>}
                </div>
                <div className="p-3.5">
                  <div className="font-bold text-sm text-brand-brown-dark">{v.title}</div>
                  <div className="text-xs text-brand-brown-light">{v.class_name || '—'} · {v.subject_name || '—'}</div>
                  <div className="text-[11px] text-brand-brown-light mt-1">{v.term} · {v.session}</div>
                  <button onClick={() => del('academic_videos', v.id)} className="text-xs px-2 py-1 rounded-md bg-danger-700 text-white mt-2.5">🗑️ Delete</button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {createType && (
        <CreateModal
          type={createType}
          classes={classes}
          onClose={() => setCreateType(null)}
          onSaved={() => { setCreateType(null); load(); }}
        />
      )}
      {aiOpen && (
        <AILessonModal defaultSession="2025/2026" defaultTerm="1st Term" onClose={() => setAiOpen(false)} />
      )}
    </div>
  );
}
