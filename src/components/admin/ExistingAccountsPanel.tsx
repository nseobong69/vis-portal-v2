import { useEffect, useState } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';

interface StaffRecord {
  id: string;
  full_name: string;
  email: string | null;
  staff_code: string | null;
  role: string | null;
  roles: string[] | null;
}
interface StudentRecord {
  id: string;
  full_name: string;
  admission_number: string | null;
  surname: string | null;
  gender: string | null;
  class_name: string | null;
}

async function callAPI(payload: object) {
  const res = await fetch('/api/admin/accounts/existing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function EditModal({
  type,
  record,
  onClose,
  onSaved,
}: {
  type: 'staff' | 'student';
  record: StaffRecord | StudentRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [cred1, setCred1] = useState(type === 'staff' ? (record as StaffRecord).email || '' : (record as StudentRecord).admission_number || '');
  const [cred2, setCred2] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!cred1.trim()) {
      setError('First field is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const data = await callAPI({ action: 'editCred', type, id: record.id, cred1, cred2: cred2 || undefined });
      if (data.authWarning) alert(data.authWarning);
      else alert('✅ Credentials updated!');
      onSaved();
    } catch (e: any) {
      setError(e.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
        <div className="font-heading font-bold text-brand-brown-dark mb-4">Edit {type === 'staff' ? 'Staff' : 'Student'} Credentials</div>
        <div className="flex flex-col gap-3">
          <Input
            id="ec-cred1"
            label={type === 'staff' ? 'Email Address' : 'Admission Number'}
            value={cred1}
            onChange={(e) => setCred1(e.target.value)}
            placeholder={type === 'staff' ? 'email@vis.edu' : 'VIS/2024/00001'}
          />
          <Input id="ec-cred2" label="New Password / Code" value={cred2} onChange={(e) => setCred2(e.target.value)} placeholder="Leave blank to keep current" />
        </div>
        {error && <div className="text-sm text-danger-700 mt-2">{error}</div>}
        <div className="flex gap-2 mt-5">
          <Button variant="primary" onClick={save} disabled={saving} className="flex-1 justify-center">
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ExistingAccountsPanel({ type }: { type: 'staff' | 'student' }) {
  const [records, setRecords] = useState<(StaffRecord | StudentRecord)[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<StaffRecord | StudentRecord | null>(null);
  const [regenId, setRegenId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    callAPI({ action: 'list', type })
      .then((data) => setRecords(data.records))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  async function regen(id: string) {
    if (!confirm(`Regenerate credentials for this ${type}? Old login will stop working immediately.`)) return;
    setRegenId(id);
    try {
      const data = await callAPI({ action: 'regenCred', type, id });
      const msg = data.newAdmissionNumber
        ? `✅ Credentials regenerated! New admission number: ${data.newAdmissionNumber} — New password: ${data.newPassword}`
        : `✅ Credentials regenerated! New password: ${data.newPassword}`;
      alert(msg);
      load();
    } catch (e: any) {
      alert(e.message || 'Could not regenerate.');
    } finally {
      setRegenId(null);
    }
  }

  if (loading) return <div className="p-6 text-center text-brand-brown-light">Loading…</div>;
  if (error) return <div className="p-4 text-danger-700 text-sm">{error}</div>;

  const filtered =
    type === 'student'
      ? (records as StudentRecord[]).filter((s) => !search || s.full_name.toLowerCase().includes(search.toLowerCase()))
      : (records as StaffRecord[]);

  return (
    <div className="flex flex-col gap-3">
      <div className="font-heading font-bold text-brand-brown-dark">
        {type === 'staff' ? '🪪 Existing Staff Accounts' : '👥 Existing Student Accounts'}
      </div>
      {type === 'student' && (
        <Input id="ea-search" placeholder="🔍 Search students…" value={search} onChange={(e) => setSearch(e.target.value)} />
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-cream text-xs uppercase text-brand-brown-light">
            {type === 'staff' ? (
              <tr>
                <th className="text-left px-4 py-2.5">Name</th>
                <th className="text-left px-4 py-2.5">Email</th>
                <th className="text-left px-4 py-2.5">Staff Code</th>
                <th className="text-left px-4 py-2.5">Roles</th>
                <th className="text-left px-4 py-2.5">Actions</th>
              </tr>
            ) : (
              <tr>
                <th className="text-left px-4 py-2.5">Name</th>
                <th className="text-left px-4 py-2.5">Adm No</th>
                <th className="text-left px-4 py-2.5">Surname</th>
                <th className="text-left px-4 py-2.5">Gender</th>
                <th className="text-left px-4 py-2.5">Class</th>
                <th className="text-left px-4 py-2.5">Actions</th>
              </tr>
            )}
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={type === 'staff' ? 5 : 6} className="text-center px-4 py-8 text-brand-brown-light">
                  No {type} with accounts found.
                </td>
              </tr>
            )}
            {type === 'staff'
              ? (filtered as StaffRecord[]).map((s) => (
                  <tr key={s.id} className="border-t border-brand-cream-dark">
                    <td className="px-4 py-2.5 font-medium text-brand-brown-dark">{s.full_name}</td>
                    <td className="px-4 py-2.5">{s.email || '—'}</td>
                    <td className="px-4 py-2.5"><span className="bg-brand-cream px-2 py-0.5 rounded font-mono text-xs">{s.staff_code || '—'}</span></td>
                    <td className="px-4 py-2.5"><span className="text-[10px] font-bold uppercase bg-brand-cream px-2 py-0.5 rounded">{(s.roles?.length ? s.roles.join(', ') : s.role || '—').toUpperCase()}</span></td>
                    <td className="px-4 py-2.5 flex gap-3">
                      <button onClick={() => setEditing(s)} className="text-brand-brown hover:underline">Edit</button>
                      <button onClick={() => regen(s.id)} disabled={regenId === s.id} className="text-info-700 hover:underline">{regenId === s.id ? 'Working…' : 'Regenerate'}</button>
                    </td>
                  </tr>
                ))
              : (filtered as StudentRecord[]).map((s) => (
                  <tr key={s.id} className="border-t border-brand-cream-dark">
                    <td className="px-4 py-2.5 font-medium text-brand-brown-dark">{s.full_name}</td>
                    <td className="px-4 py-2.5">{s.admission_number || '—'}</td>
                    <td className="px-4 py-2.5"><span className="bg-brand-cream px-2 py-0.5 rounded font-mono text-xs">{s.surname || '—'}</span></td>
                    <td className="px-4 py-2.5">{s.gender || '—'}</td>
                    <td className="px-4 py-2.5"><span className="text-[10px] font-bold uppercase bg-brand-cream px-2 py-0.5 rounded">{s.class_name || '—'}</span></td>
                    <td className="px-4 py-2.5 flex gap-3">
                      <button onClick={() => setEditing(s)} className="text-brand-brown hover:underline">Edit</button>
                      <button onClick={() => regen(s.id)} disabled={regenId === s.id} className="text-info-700 hover:underline">{regenId === s.id ? 'Working…' : 'Regenerate'}</button>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditModal
          type={type}
          record={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
