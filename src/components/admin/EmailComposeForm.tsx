import { useEffect, useState } from 'react';
import { sendEmailViaEmailJS, type EmailJSConfig } from '../../lib/emailjs-browser';

// FIX: this form previously posted to POST /api/admin/email/send,
// a route that does not exist anywhere in src/pages/api/admin/ —
// every send from this form failed with a 404. EmailJS's SDK only
// works from the browser (see lib/emailjs-browser.ts's header comment
// for why), so the fix is to send from here directly and just log the
// outcome server-side via the two new lightweight routes
// (/api/admin/email/config, /api/admin/email/log) — not to build a
// server-side "send" endpoint that was never going to work.
export default function EmailComposeForm() {
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState<EmailJSConfig | null>(null);
  const [cfgError, setCfgError] = useState('');

  useEffect(() => {
    fetch('/api/admin/email/config')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setCfgError(data.error);
        else setCfg(data);
      })
      .catch(() => setCfgError('Could not load email configuration.'));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cfg) {
      setStatus('Email configuration is still loading — try again in a moment.');
      return;
    }
    setBusy(true);
    setStatus(null);

    let logId: string | null = null;
    try {
      const logRes = await fetch('/api/admin/email/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', recipientEmail: recipient, subject }),
      });
      const logData = await logRes.json();
      if (logRes.ok) logId = logData.id;

      await sendEmailViaEmailJS({ toEmail: recipient, subject, bodyHtml: message.replace(/\n/g, '<br>'), message }, cfg);

      if (logId) {
        await fetch('/api/admin/email/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update', id: logId, status: 'sent' }),
        });
      }
      setStatus('Sent.');
      setRecipient('');
      setSubject('');
      setMessage('');
    } catch (err: any) {
      const errorMessage = err?.message || 'Could not send email.';
      if (logId) {
        await fetch('/api/admin/email/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update', id: logId, status: 'failed', errorMessage }),
        });
      }
      setStatus(`Error: ${errorMessage}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-3 bg-brand-cream/60 rounded-md">
      {cfgError && <div className="text-xs text-danger-700">{cfgError}</div>}
      <div className="flex gap-3">
        <input
          placeholder="Recipient email"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          className="flex-1 border border-brand-cream-dark rounded px-2 py-1.5 text-sm"
          required
          type="email"
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
