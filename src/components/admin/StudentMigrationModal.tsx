import { useState } from 'react';
import Button from '../ui/Button';

interface Props {
  onClose: () => void;
  onDone: () => void;
}

export default function StudentMigrationModal({ onClose, onDone }: Props) {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [failed, setFailed] = useState(0);

  async function run() {
    setRunning(true);
    setLog([]);
    try {
      const res = await fetch('/api/admin/students/migrate-auth', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Migration failed.');
      setLog(data.log || []);
      setFailed(data.failed || 0);
      setDone(true);
      if ((data.success || 0) + (data.skipped || 0) > 0) {
        setTimeout(onDone, 1500);
      }
    } catch (e) {
      setLog((prev) => [...prev, `❌ ${e instanceof Error ? e.message : 'Migration failed.'}`]);
      setDone(true);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-lg max-w-[540px] w-full p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold text-xl text-violet-700">🪄 Student Auth Migration</h3>
          <button onClick={onClose} className="text-2xl text-brand-brown-light leading-none">&times;</button>
        </div>
        <p className="text-xs bg-violet-50 text-violet-900 rounded-md px-3 py-2.5">
          Creates Supabase Auth accounts for all students who don't have one yet. Password = <strong>SURNAME</strong> (uppercase). Runs securely server-side — no key required from you.
        </p>

        {log.length > 0 && (
          <div className="bg-[#1E1B2E] text-violet-200 rounded-md p-3.5 font-mono text-[11.5px] max-h-60 overflow-y-auto whitespace-pre-wrap">
            {log.join('\n')}
          </div>
        )}

        <div className="flex gap-2">
          <Button type="button" variant="gold" onClick={run} disabled={running} className="flex-1 justify-center" style={{ background: '#7C3AED', borderColor: '#7C3AED' }}>
            {running ? 'Running…' : done ? (failed > 0 ? '⚠ Done (with errors)' : '✓ Migration Complete') : '▶ Run Migration'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
