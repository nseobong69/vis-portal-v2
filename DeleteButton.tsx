import { useState } from 'react';

interface DeleteButtonProps {
  table: string;
  id: string | number;
}

export default function DeleteButton({ table, id }: DeleteButtonProps) {
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!window.confirm('Delete this record? This cannot be undone.')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/records', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, id }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        window.alert(json.error || 'Could not delete.');
        setBusy(false);
        return;
      }
      window.location.reload();
    } catch {
      window.alert('Network error — could not reach the server.');
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={busy}
      className="text-xs text-red-600 hover:underline disabled:opacity-50"
    >
      {busy ? '…' : 'Delete'}
    </button>
  );
}
