import { useMemo, useState } from 'react';
import StaffFormModal, { type StaffRecord } from './StaffFormModal';
import Button from '../ui/Button';

interface StaffRow extends StaffRecord {
  id: string;
  full_name: string;
  email?: string;
  role?: string;
}

interface Props {
  staff: StaffRow[];
  canDelete: boolean;
}

export default function StaffManager({ staff, canDelete }: Props) {
  const [search, setSearch] = useState('');
  const [modalStaff, setModalStaff] = useState<StaffRow | null | undefined>(undefined);

  const filtered = useMemo(() => {
    if (!search) return staff;
    const q = search.toLowerCase();
    return staff.filter((s) => s.full_name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q));
  }, [staff, search]);

  async function del(s: StaffRow) {
    if (!confirm(`Permanently delete staff account for ${s.full_name}? This cannot be undone.`)) return;
    const res = await fetch('/api/admin/staff/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id: s.id }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data?.error || 'Delete failed.'); return; }
    window.location.reload();
  }

  return (
    <div className="bg-white rounded-lg border border-brand-cream-dark overflow-hidden">
      <div className="p-4 border-b border-brand-cream-dark flex items-center gap-3 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Search staff…"
          className="font-body text-sm rounded-sm border border-brand-cream-dark px-3 py-2 max-w-[230px]"
        />
        <Button type="button" variant="gold" className="ml-auto" onClick={() => setModalStaff(null)}>
          + Add Staff
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-brand-brown-light border-b border-brand-cream-dark">
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Staff Code</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-brand-brown-light">No staff found.</td></tr>
            )}
            {filtered.map((s) => {
              const rlist = s.roles?.length ? s.roles : [s.role].filter(Boolean) as string[];
              return (
                <tr key={s.id} className="border-b border-brand-cream-dark last:border-0">
                  <td className="px-4 py-2 font-semibold">{s.full_name}</td>
                  <td className="px-4 py-2 text-brand-brown-light">{s.email || '—'}</td>
                  <td className="px-4 py-2">{s.staff_code || '—'}</td>
                  <td className="px-4 py-2">
                    {rlist.length ? rlist.map((r) => (
                      <span key={r} className="text-[10px] rounded-full px-1.5 py-0.5 bg-brand-cream mr-1">{r.toUpperCase()}</span>
                    )) : <span className="text-[10px] rounded-full px-1.5 py-0.5 bg-brand-cream">—</span>}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1.5">
                      <button onClick={() => setModalStaff(s)} className="text-xs px-2 py-1 rounded-sm border border-brand-cream-dark hover:bg-brand-cream" title="Edit">✏️</button>
                      {canDelete && (
                        <button onClick={() => del(s)} className="text-xs px-2 py-1 rounded-sm bg-danger-700 text-white" title="Delete Staff (Super Admin only)">🗑️</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalStaff !== undefined && (
        <StaffFormModal staff={modalStaff} onClose={() => setModalStaff(undefined)} onSaved={() => window.location.reload()} />
      )}
    </div>
  );
}
