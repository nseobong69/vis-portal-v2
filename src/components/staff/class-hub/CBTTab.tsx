import { useEffect, useState } from 'react';
import Card from '../../ui/Card';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Modal from '../../ui/Modal';
import { useToast } from '../../ui/Toast';
import {
  fetchHubCBTExams,
  fetchClassSubjects,
  createHubCBT,
  deleteHubCBT,
  setHubCBTStatus,
  type HubCBTExam,
  type SubjectOption,
} from '../../../lib/class-hub';

interface Props {
  classId: string;
  className: string;
  term: string;
  session: string;
  userId: string;
}

const TONE: Record<string, 'neutral' | 'success' | 'info'> = { draft: 'neutral', active: 'success', completed: 'info' };

// Mirrors hubCBT()/hubCreateCBT()/hubSaveCBT(). Question management
// (manageQs), live results (viewCBTResults) reuse the standalone CBT
// screen (Feature Checklist row 16) once ported — not duplicated here.
export default function CBTTab({ classId, className, term, session, userId }: Props) {
  const toast = useToast();
  const [exams, setExams] = useState<HubCBTExam[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [duration, setDuration] = useState(60);
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([fetchHubCBTExams(classId), fetchClassSubjects(classId)])
      .then(([e, s]) => {
        setExams(e);
        setSubjects(s);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const openCreate = () => {
    setTitle('');
    setSubjectId('');
    setDuration(60);
    setInstructions('');
    setModalOpen(true);
  };

  const onSave = async () => {
    const subj = subjects.find((s) => s.id === subjectId);
    setSaving(true);
    const res = await createHubCBT({
      classId,
      className,
      title,
      subjectId: subjectId || null,
      subjectName: subj?.name || '',
      durationMinutes: duration,
      term,
      session,
      instructions,
      createdBy: userId,
    });
    setSaving(false);
    if (!res.ok) {
      toast.show('danger', res.error || 'Error creating CBT.');
      return;
    }
    toast.show('success', 'CBT created!');
    setModalOpen(false);
    load();
  };

  const onToggleActive = async (exam: HubCBTExam) => {
    const next = exam.status === 'draft' ? 'active' : 'completed';
    const err = await setHubCBTStatus(exam.id, next);
    if (err) {
      toast.show('danger', 'Error: ' + err);
      return;
    }
    load();
  };

  const onDelete = async (exam: HubCBTExam) => {
    if (!confirm(`Delete "${exam.title}"? This cannot be undone.`)) return;
    const err = await deleteHubCBT(exam.id);
    if (err) {
      toast.show('danger', 'Error: ' + err);
      return;
    }
    toast.show('success', 'CBT deleted.');
    load();
  };

  if (loading) return <p className="text-sm text-brand-brown-light">Loading…</p>;

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={openCreate}>
          + Create CBT for {className}
        </Button>
      </div>

      {exams.length === 0 ? (
        <Card>
          <p className="text-center text-brand-brown-light py-6">
            No CBT exams for {className} yet.{' '}
            <button className="text-brand-brown font-semibold underline" onClick={openCreate}>
              Create the first one
            </button>
            .
          </p>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {exams.map((e) => (
            <Card key={e.id}>
              <div className="flex justify-between items-start gap-2 mb-2">
                <span className="font-heading font-bold text-brand-brown-dark text-sm">{e.title}</span>
                <Badge tone={TONE[e.status] ?? 'neutral'}>{e.status.toUpperCase()}</Badge>
              </div>
              <p className="text-xs text-brand-brown-light mb-3">
                {e.subject_name || '—'} · {e.duration_minutes}min · {e.total_questions || 0} questions
              </p>
              <div className="flex flex-wrap gap-2">
                {e.status !== 'completed' && (
                  <Button size="sm" variant={e.status === 'draft' ? 'primary' : 'danger'} onClick={() => onToggleActive(e)}>
                    {e.status === 'draft' ? 'Activate' : 'End Exam'}
                  </Button>
                )}
                <Button size="sm" variant="danger" onClick={() => onDelete(e)}>
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={`Create CBT — ${className}`}>
        <div className="flex flex-col gap-3">
          <Input id="hcbt-title" label="Exam Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Mathematics Mid-Term Test" />
          <div className="grid grid-cols-2 gap-3">
            <Select
              id="hcbt-subj"
              label="Subject"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              placeholder="Select Subject"
              options={subjects.map((s) => ({ value: s.id, label: s.name }))}
            />
            <Input id="hcbt-dur" label="Duration (mins)" type="number" min={5} value={duration} onChange={(e) => setDuration(parseInt(e.target.value) || 60)} />
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-brand-brown-dark">Instructions (optional)</span>
            <textarea
              className="rounded-sm border border-brand-cream-dark px-3 py-2 text-sm"
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </label>
        </div>
        <div className="flex gap-2 mt-4">
          <Button className="flex-1" onClick={onSave} disabled={saving || !title.trim()}>
            {saving ? 'Creating…' : 'Create CBT'}
          </Button>
          <Button variant="secondary" onClick={() => setModalOpen(false)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  );
}
