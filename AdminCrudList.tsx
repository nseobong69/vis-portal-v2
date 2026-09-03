import { useState } from 'react';
import AdminRecordForm, { type AdminFormField } from './AdminRecordForm';

interface Column {
  key: string;
  header: string;
}

interface AdminCrudListProps {
  table: string;
  columns: Column[];
  initialRows: Record<string, unknown>[];
  formFields: AdminFormField[];
  emptyMessage?: string;
}

/**
 * Client-hydrated table+form for the whitelisted simple admin tables
 * (Section: /api/admin/records TABLE_FIELDS). Rendered as one island so
 * the Delete button's onClick actually works — a plain server-rendered
 * Table (no client:load) can't host an interactive button inside a cell,
 * so this bundles Table-equivalent markup, AdminRecordForm, and delete
 * all in one hydrated component instead of three separately-hydrated
 * pieces.
 */
export default function AdminCrudList({
  table,
  columns,
  initialRows,
  formFields,
  emptyMessage = 'No records found.',
}: AdminCrudListProps) {
  const [rows, setRows] = useState(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(id: unknown) {
    if (!window.confirm('Delete this record? This cannot be undone.')) return;
    setBusyId(String(id));
    setError(null);
    try {
      const res = await fetch('/api/admin/records', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, id }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || 'Could not delete.');
        return;
      }
      setRows((r) => r.filter((row) => row.id !== id));
    } catch {
      setError('Network error — could not reach the server.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleAdd(fields: Record<string, unknown>) {
    const res = await fetch('/api/admin/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, fields }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Could not save.');
    setRows((r) => [...r, json.row]);
  }

  return (
    <div>
      {formFields.length > 0 && <AdminRecordForm table={table} fields={formFields} onAdd={handleAdd} />}
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <div className="overflow-x-auto rounded-md border border-brand-cream-dark">
        <table className="w-full text-sm font-body text-left">
          <thead className="bg-brand-cream text-brand-brown-dark">
            <tr>
              {columns.map((col) => (
                <th key={col.key} className="px-4 py-2.5 font-heading font-semibold text-xs uppercase tracking-wide">
                  {col.header}
                </th>
              ))}
              <th className="px-4 py-2.5 font-heading font-semibold text-xs uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-cream-dark">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-6 text-center text-brand-brown-light">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={String(row.id ?? JSON.stringify(row))} className="hover:bg-brand-cream/50">
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-2.5 text-body">
                      {String(row[col.key] ?? '')}
                    </td>
                  ))}
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => handleDelete(row.id)}
                      disabled={busyId === String(row.id)}
                      className="text-xs text-red-600 hover:underline disabled:opacity-50"
                    >
                      {busyId === String(row.id) ? '…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
