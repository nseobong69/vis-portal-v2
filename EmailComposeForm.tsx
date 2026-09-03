import { useState } from 'react';

export default function EmailComposeForm() {
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch('/api/admin/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient, subject, message }),
      });
      const json = await res.json();
      if (!res.ok) {
        setStatus(`Error: ${json.error}`);
        return;
      }
      setStatus('Sent.');
      setRecipient(''); setSubject(''); setMessage('');
    } catch {
      setStatus('Network error — could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-3 bg-brand-cream/60 rounded-md">
      <div className="flex gap-3">
        <input
          placeholder="Recipient email"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          className="flex-1 border border-brand-cream-dark rounded px-2 py-1.5 text-sm"
          required
        />
        <input
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="flex-1 border border-brand-cream-dark rounded px-2 py-1.5 text-sm"
          required
        />
      </div>
      <textarea
        placeholder="Message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        className="w-full border border-brand-cream-dark rounded px-2 py-1.5 text-sm"
        required
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="px-3 py-1.5 text-xs font-heading font-semibold rounded bg-brand-gold text-brand-brown-dark disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send'}
        </button>
        {status && <span className="text-xs text-brand-brown-dark">{status}</span>}
      </div>
    </form>
  );
}
