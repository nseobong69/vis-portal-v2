import { useState } from 'react';
import { sendEmailViaEmailJS, type EmailJSConfig } from '../../lib/emailjs-browser';

interface Candidate {
  studentId: string;
  studentName: string;
  className: string | null;
  toEmail: string;
  toName: string;
  balance: number;
}
interface LogRow {
  id: string;
  sent_at: string;
  student_name: string | null;
  recipient_email: string | null;
  balance: number | null;
  status: string | null;
}
interface Settings {
  enabled: boolean;
  intervalDays: number;
  minBalance: number;
}
interface Props {
  initialCandidates: Candidate[];
  initialLog: LogRow[];
  initialSettings: Settings;
  emailjsConfig: EmailJSConfig;
}

function money(n: number) {
  return `₦${Number(n || 0).toLocaleString()}`;
}

// Ports the exact reminder-email content from index.html's
// runFeeReminders() (~L20441-20443) — same subject line and body copy,
// word for word.
function buildReminderEmail(c: Candidate, schoolName: string) {
  const subject = `Outstanding Fee Balance — ${c.studentName}`;
  const bodyHtml = `Dear ${c.toName},<br><br>This is a reminder that <strong>${c.studentName}</strong> (${c.className || ''}) has an outstanding fee balance of <strong>${money(c.balance)}</strong>.<br><br>Kindly settle this balance at your earliest convenience to avoid disruption to your ward's academic activities.<br><br>Thank you,<br>${schoolName}`;
  return { subject, bodyHtml };
}

export default function FeeRemindersManager({ initialCandidates, initialLog, initialSettings, emailjsConfig }: Props) {
  const [candidates] = useState(initialCandidates);
  const [log, setLog] = useState(initialLog);
  const [settings, setSettings] = useState(initialSettings);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState('');
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState('');

  async function saveSettings() {
    setSavingSettings(true);
    setSettingsStatus('');
    try {
      // Reuses the same generic /api/admin/settings/save endpoint every
      // other settings.astro card already posts to — school_settings
      // columns, patched by whatever keys are sent.
      const res = await fetch('/api/admin/settings/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            fee_reminders_enabled: settings.enabled,
            fee_reminder_interval_days: settings.intervalDays,
            fee_reminder_min_balance: settings.minBalance,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Save failed.');
      setSettingsStatus('Saved.');
    } catch (e: any) {
      setSettingsStatus(e.message || 'Save failed.');
    } finally {
      setSavingSettings(false);
    }
  }

  // Ports runFeeReminders(manual=true) — manual mode skips the
  // per-student interval check entirely (index.html L20432-20440's
  // `if(!manual){...}` guard), so every current candidate gets emailed
  // when this button is clicked, same as the old app's own button.
  async function sendNow() {
    setSending(true);
    setSendStatus('Sending…');
    let sent = 0;
    let failed = 0;
    const newLogRows: LogRow[] = [];

    for (const c of candidates) {
      const { subject, bodyHtml } = buildReminderEmail(c, emailjsConfig.school_name || 'the school');
      let logId: string | null = null;
      try {
        const logRes = await fetch('/api/admin/email/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create', recipientEmail: c.toEmail, recipientName: c.toName, subject }),
        });
        const logData = await logRes.json();
        if (logRes.ok) logId = logData.id;

        await sendEmailViaEmailJS({ toEmail: c.toEmail, toName: c.toName, subject, bodyHtml }, emailjsConfig);

        if (logId) {
          await fetch('/api/admin/email/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update', id: logId, status: 'sent' }),
          });
        }
        // Fee-reminder-specific record (fee_reminder_log, separate from
        // email_delivery_log) — this is what powers the "Recent
        // Reminder Log" table below, matching the old app's own split
        // between the two tables.
        const frRes = await fetch('/api/admin/fee-reminders/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId: c.studentId, studentName: c.studentName, recipientEmail: c.toEmail, recipientName: c.toName, balance: c.balance, status: 'sent' }),
        });
        const frData = await frRes.json();
        if (frRes.ok && frData.row) newLogRows.unshift(frData.row);
        sent++;
      } catch (err: any) {
        const errorMessage = err?.message || 'Send failed.';
        if (logId) {
          await fetch('/api/admin/email/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update', id: logId, status: 'failed', errorMessage }),
          });
        }
        const frRes = await fetch('/api/admin/fee-reminders/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId: c.studentId, studentName: c.studentName, recipientEmail: c.toEmail, recipientName: c.toName, balance: c.balance, status: 'failed', errorMessage }),
        });
        const frData = await frRes.json();
        if (frRes.ok && frData.row) newLogRows.unshift(frData.row);
        failed++;
      }
    }

    setLog((prev) => [...newLogRows, ...prev].slice(0, 50));
    setSendStatus(`Sent ${sent} reminder(s)${failed ? `, ${failed} failed` : ''}.`);
    setSending(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-5 flex flex-col gap-3">
        <div className="font-heading font-bold text-brand-brown-dark">Reminder Settings</div>
        <div className="flex flex-wrap gap-4 items-end">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-brand-brown-dark font-medium">Enabled</span>
            <select
              value={settings.enabled ? 'true' : 'false'}
              onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.value === 'true' }))}
              className="border border-brand-cream-dark rounded px-2 py-1.5 w-32"
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-brand-brown-dark font-medium">Remind every (days)</span>
            <input
              type="number"
              min={1}
              value={settings.intervalDays}
              onChange={(e) => setSettings((s) => ({ ...s, intervalDays: Number(e.target.value) || 7 }))}
              className="border border-brand-cream-dark rounded px-2 py-1.5 w-28"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-brand-brown-dark font-medium">Minimum balance (₦)</span>
            <input
              type="number"
              min={0}
              value={settings.minBalance}
              onChange={(e) => setSettings((s) => ({ ...s, minBalance: Number(e.target.value) || 0 }))}
              className="border border-brand-cream-dark rounded px-2 py-1.5 w-32"
            />
          </label>
          <button
            onClick={saveSettings}
            disabled={savingSettings}
            className="px-3 py-1.5 text-xs font-heading font-semibold rounded bg-brand-gold text-brand-brown-dark disabled:opacity-50"
          >
            {savingSettings ? 'Saving…' : 'Save'}
          </button>
          {settingsStatus && <span className="text-xs text-brand-brown-light">{settingsStatus}</span>}
        </div>
        <p className="text-xs text-brand-brown-light">
          A minimum-balance change only affects new "Currently Owing" loads on the next page visit — the list below reflects the value saved when this page last loaded.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="font-heading font-bold text-brand-brown-dark">Currently Owing ({candidates.length})</div>
          <button
            onClick={sendNow}
            disabled={sending || candidates.length === 0}
            className="px-3 py-1.5 text-xs font-heading font-semibold rounded bg-brand-gold text-brand-brown-dark disabled:opacity-50"
          >
            {sending ? 'Sending…' : '📨 Send Reminders Now'}
          </button>
        </div>
        {sendStatus && <div className="text-sm text-brand-brown-dark">{sendStatus}</div>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-cream text-xs uppercase text-brand-brown-light">
              <tr>
                <th className="text-left px-3 py-2">Student</th>
                <th className="text-left px-3 py-2">Class</th>
                <th className="text-left px-3 py-2">Balance</th>
                <th className="text-left px-3 py-2">Recipient</th>
              </tr>
            </thead>
            <tbody>
              {candidates.length === 0 && (
                <tr><td colSpan={4} className="text-center px-3 py-6 text-brand-brown-light">No outstanding balances with a reachable parent/student email.</td></tr>
              )}
              {candidates.map((c) => (
                <tr key={c.studentId} className="border-t border-brand-cream-dark">
                  <td className="px-3 py-2 font-medium text-brand-brown-dark">{c.studentName}</td>
                  <td className="px-3 py-2">{c.className || '—'}</td>
                  <td className="px-3 py-2 font-semibold text-danger-700">{money(c.balance)}</td>
                  <td className="px-3 py-2">{c.toEmail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-5 flex flex-col gap-3">
        <div className="font-heading font-bold text-brand-brown-dark">Recent Reminder Log</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-cream text-xs uppercase text-brand-brown-light">
              <tr>
                <th className="text-left px-3 py-2">Sent</th>
                <th className="text-left px-3 py-2">Student</th>
                <th className="text-left px-3 py-2">Recipient</th>
                <th className="text-left px-3 py-2">Balance</th>
                <th className="text-left px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {log.length === 0 && (
                <tr><td colSpan={5} className="text-center px-3 py-6 text-brand-brown-light">No reminders sent yet.</td></tr>
              )}
              {log.map((l) => (
                <tr key={l.id} className="border-t border-brand-cream-dark">
                  <td className="px-3 py-2">{new Date(l.sent_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{l.student_name || ''}</td>
                  <td className="px-3 py-2">{l.recipient_email || ''}</td>
                  <td className="px-3 py-2">{money(l.balance || 0)}</td>
                  <td className="px-3 py-2">
                    {l.status === 'sent'
                      ? <span className="text-success-700 font-semibold">Sent</span>
                      : <span className="text-danger-700 font-semibold">Failed</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
