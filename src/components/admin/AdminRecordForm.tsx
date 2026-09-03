import { useState } from 'react';

export interface AdminFormField {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'checkbox';
  placeholder?: string;
}

interface AdminRecordFormProps {
  table: string;
  fields: AdminFormField[];
  /** If supplied (e.g. from AdminCrudList), called instead of posting
   *  directly + reloading — lets the parent patch its own row state. */
  onAdd?: (fields: Record<string, unknown>) => Promise<void>;
}

/**
 * Minimal add-row form, posted to the whitelisted /api/admin/records
 * endpoint. Reloads the page on success rather than optimistically
 * patching local state — simplest correct thing given every admin list
 * page is currently a plain server-rendered .astro page with no client
 * state of its own to patch.
 */
export default function AdminRecordForm({ table, fields, onAdd }: AdminRecordFormProps) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (onAdd) {
        await onAdd(values);
        setValues({});
        return;
      }
      const res = await fetch('/api/admin/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, fields: values }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Could not save.');
        return;
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error — could not reach the server.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 mb-4 p-3 bg-brand-cream/60 rounded-md">
      {fields.map((f) => (
        <label key={f.key} className="flex flex-col text-xs text-brand-brown-dark">
          <span className="font-heading font-semibold mb-1">{f.label}</span>
          {f.type === 'checkbox' ? (
            <input
              type="checkbox"
              checked={!!values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.checked }))}
              className="h-4 w-4"
            />
          ) : (
            <input
              type={f.type ?? 'text'}
              placeholder={f.placeholder}
              value={(values[f.key] as string) ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className="border border-brand-cream-dark rounded px-2 py-1 text-sm"
            />
          )}
        </label>
      ))}
      <button
        type="submit"
        disabled={submitting}
        className="px-3 py-1.5 text-xs font-heading font-semibold rounded bg-brand-gold text-brand-brown-dark disabled:opacity-50"
      >
        {submitting ? 'Saving…' : 'Add'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}
