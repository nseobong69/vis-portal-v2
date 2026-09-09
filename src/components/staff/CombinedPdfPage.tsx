import { useEffect, useMemo, useState } from 'react';
import Card from '../ui/Card';
import Select from '../ui/Select';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { useToast } from '../ui/Toast';
import { generateCombinedPdf } from '../../lib/clientPdf';
import type { CombinedPdfStudentPayload } from '../../lib/combinedPdf';

async function callCombinedPdfAPI(body: object) {
  const res = await fetch('/api/staff/combined-pdf/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

const TERMS = ['1st Term', '2nd Term', '3rd Term'];

interface ClassOption {
  id: string;
  name: string;
  arm: string | null;
  level: string | null;
}

const SESSIONS = ['2024/2025', '2025/2026']; // same fixed list as ResultsSheet.tsx

interface Props {
  role: string;
  userId: string;
}

export default function CombinedPdfPage({ role }: Props) {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [noClasses, setNoClasses] = useState(false);
  const [loadingClasses, setLoadingClasses] = useState(true);

  const [classId, setClassId] = useState('');
  const [term, setTerm] = useState(TERMS[0]);
  const [session, setSession] = useState(SESSIONS[SESSIONS.length - 1]);

  const [status, setStatus] = useState('');
  const [generating, setGenerating] = useState(false);
  const { show: toastShow } = useToast();

  useEffect(() => {
    callCombinedPdfAPI({ action: 'init' })
      .then((data) => {
        setClasses(data.classes || []);
        setNoClasses(!!data.noClasses);
      })
      .catch((e) => toastShow('danger', e.message))
      .finally(() => setLoadingClasses(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedClass = useMemo(() => classes.find((c) => c.id === classId), [classes, classId]);

  const classOptions = classes.map((c) => ({
    value: c.id,
    label: `${c.name}${c.arm ? ' ' + c.arm : ''}`,
  }));

  async function handleGenerate() {
    if (!classId || !selectedClass) {
      toastShow('danger', 'Select a class.');
      return;
    }
    setGenerating(true);
    setStatus('Loading student data…');
    try {
      const className = `${selectedClass.name}${selectedClass.arm ? ' ' + selectedClass.arm : ''}`;
      const payload: { students: CombinedPdfStudentPayload[]; schoolSettings: Record<string, any>; className: string } =
        await callCombinedPdfAPI({
          action: 'data',
          classId,
          className,
          classLevel: selectedClass.level,
          term,
          session,
        });

      setStatus(`Building PDF for ${payload.students.length} students… Please wait.`);
      await generateCombinedPdf(className, payload.students, term, session, payload.schoolSettings, (p) => {
        setStatus(`Processing ${p.index}/${p.total}: ${p.studentName}…`);
      });

      setStatus('');
      toastShow('success', `✅ Combined PDF saved — ${payload.students.length} result pages!`);
    } catch (e: any) {
      setStatus('');
      toastShow('danger', e.message || 'PDF error.');
    } finally {
      setGenerating(false);
    }
  }

  if (loadingClasses) {
    return <Card>Loading classes…</Card>;
  }

  if (role === 'teacher' && noClasses) {
    return (
      <Card>
        <div className="text-center text-brand-brown-light py-8">You are not assigned to any class yet.</div>
      </Card>
    );
  }

  return (
    <Card title="Generate Combined Class Results PDF" className="max-w-xl">
      <div className="flex flex-col gap-4">
        <Select
          id="cpdf-class"
          label="Class"
          placeholder="Select Class"
          options={classOptions}
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            id="cpdf-term"
            label="Term"
            options={TERMS.map((t) => ({ value: t, label: t }))}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          <Input id="cpdf-session" label="Session" value={session} onChange={(e) => setSession(e.target.value)} />
        </div>
      </div>

      <Button variant="primary" className="w-full mt-5 justify-center py-3" onClick={handleGenerate} disabled={generating}>
        {generating ? 'Generating…' : 'Generate Combined PDF'}
      </Button>
      {status && <div className="mt-3 text-sm text-brand-brown-light">{status}</div>}
    </Card>
  );
}
