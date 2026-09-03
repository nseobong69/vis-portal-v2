import { useState } from 'react';

interface SettingsFormProps {
  initial: Record<string, string>;
}

export default function SettingsForm({ initial }: SettingsFormProps) {
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch('/api/admin/settings/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const json = await res.json();
      setStatus(res.ok ? 'Saved.' : `Error: ${json.error}`);
    } catch {
      setStatus('Network error — could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  const fields: [string, string][] = [
    ['school_name', 'School Name'],
    ['tagline', 'Tagline'],
    ['what_sets_us_apart', '"What Sets Us Apart" text'],
    ['social_links', 'Social Links (comma-separated URLs)'],
    ['adsense_client_id', 'AdSense Client ID'],
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {fields.map(([key, label]) => (
        <label key={key} className="flex flex-col text-xs text-brand-brown-dark">
          <span className="font-heading font-semibold mb-1">{label}</span>
          <input
            value={values[key] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
            className="border border-brand-cream-dark rounded px-2 py-1.5 text-sm"
          />
        </label>
      ))}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="px-3 py-1.5 text-xs font-heading font-semibold rounded bg-brand-gold text-brand-brown-dark disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save Settings'}
        </button>
        {status && <span className="text-xs text-brand-brown-dark">{status}</span>}
      </div>
    </form>
  );
}
