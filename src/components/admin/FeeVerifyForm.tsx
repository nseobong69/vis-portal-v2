import { useState } from 'react';

export default function FeeVerifyForm() {
  const [reference, setReference] = useState('');
  const [studentId, setStudentId] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch('/api/admin/fees/verify-and-record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference, student_id: studentId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setStatus(`Error: ${json.error}`);
        return;
      }
      setStatus(`Recorded — ₦${json.row.amount} for student ${json.row.student_id}.`);
      setReference('');
      setStudentId('');
    } catch {
      setStatus('Network error — could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 mb-4 p-3 bg-brand-cream/60 rounded-md">
      <label className="flex flex-col text-xs text-brand-brown-dark">
        <span className="font-heading font-semibold mb-1">Paystack Reference</span>
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          className="border border-brand-cream-dark rounded px-2 py-1 text-sm"
          required
        />
      </label>
      <label className="flex flex-col text-xs text-brand-brown-dark">
        <span className="font-heading font-semibold mb-1">Student ID</span>
        <input
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          className="border border-brand-cream-dark rounded px-2 py-1 text-sm"
          required
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="px-3 py-1.5 text-xs font-heading font-semibold rounded bg-brand-gold text-brand-brown-dark disabled:opacity-50"
      >
        {busy ? 'Verifying…' : 'Verify & Record'}
      </button>
      {status && <span className="text-xs text-brand-brown-dark">{status}</span>}
    </form>
  );
}
