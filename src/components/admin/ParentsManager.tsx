import { useState } from 'react';
import Button from '../ui/Button';

interface Parent {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  relationship: string | null;
  linked_students: string | null;
  student_ids: string[] | null;
  has_account: boolean;
  auth_id: string | null;
}

interface Student {
  id: string;
  full_name: string;
  class_name: string | null;
}

interface Props {
  initialParents: Parent[];
  students: Student[];
  isSuperAdmin: boolean;
}

type Modal =
  | { type: 'add' }
  | { type: 'edit'; parent: Parent }
  | { type: 'link'; parent: Parent }
  | null;

async function callAPI(payload: object) {
  const res = await fetch('/api/admin/parents/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

export default function ParentsManager({ initialParents, students, isSuperAdmin }: Props) {
  const [parents, setParents] = useState(initialParents);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);

  // Add form state
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addAddress, setAddAddress] = useState('');
  const [addRel, setAddRel] = useState('Father');

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');

  // Link state
  const [linkedIds, setLinkedIds] = useState<string[]>([]);

  const filtered = parents.filter((p) =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (p.email || '').toLowerCase().includes(search.toLowerCase())
  );

  function openAdd() {
    setAddName(''); setAddEmail(''); setAddPhone(''); setAddAddress(''); setAddRel('Father');
    setModal({ type: 'add' });
  }

  function openEdit(p: Parent) {
    setEditName(p.full_name); setEditEmail(p.email || '');
    setEditPhone(p.phone || ''); setEditAddress(p.address || '');
    setModal({ type: 'edit', parent: p });
  }

  function openLink(p: Parent) {
    setLinkedIds(p.student_ids || []);
    setModal({ type: 'link', parent: p });
  }

  async function handleAdd() {
    if (!addName.trim()) { alert('Full name is required.'); return; }
    setBusy(true);
    try {
      const data = await callAPI({
        action: 'add',
        full_name: addName.trim(),
        email: addEmail.trim().toLowerCase() || null,
        phone: addPhone.trim() || null,
        address: addAddress.trim() || null,
        relationship: addRel,
      });
      setParents((prev) => [data.parent, ...prev]);
      setModal(null);
    } catch (e: any) {
      alert(e.message);
    } finally { setBusy(false); }
  }

  async function handleEdit() {
    if (modal?.type !== 'edit') return;
    setBusy(true);
    try {
      const data = await callAPI({
        action: 'edit',
        id: modal.parent.id,
        full_name: editName.trim(),
        email: editEmail.trim().toLowerCase() || null,
        phone: editPhone.trim() || null,
        address: editAddress.trim() || null,
      });
      setParents((prev) => prev.map((p) => p.id === modal.parent.id ? data.parent : p));
      setModal(null);
    } catch (e: any) {
      alert(e.message);
    } finally { setBusy(false); }
  }

  async function handleLink() {
    if (modal?.type !== 'link') return;
    setBusy(true);
    try {
      const names = students.filter((s) => linkedIds.includes(s.id)).map((s) => s.full_name);
      await callAPI({ action: 'link', parent_id: modal.parent.id, student_ids: linkedIds, linked_names: names });
      setParents((prev) => prev.map((p) =>
        p.id === modal.parent.id
          ? { ...p, student_ids: linkedIds, linked_students: names.join(', ') }
          : p
      ));
      setModal(null);
    } catch (e: any) {
      alert(e.message);
    } finally { setBusy(false); }
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this parent?')) return;
    try {
      await callAPI({ action: 'remove', id });
      setParents((prev) => prev.filter((p) => p.id !== id));
    } catch (e: any) {
      alert(e.message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h1 className="font-heading font-bold text-2xl text-brand-brown-dark">Parents</h1>
          <p className="text-sm text-brand-brown-light">Create and manage parent accounts.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isSuperAdmin && (
            <Button variant="secondary" onClick={() => alert('Auth Migration — coming soon')}>
              Auth Migration
            </Button>
          )}
          <Button variant="primary" onClick={openAdd}>+ Add Parent</Button>
        </div>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-lg shadow-sm border border-brand-cream-dark overflow-hidden">
        <div className="p-4 border-b border-brand-cream-dark">
          <input
            className="border border-brand-cream-dark rounded-md px-3 py-2 text-sm w-full max-w-xs"
            placeholder="🔍 Search parents…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand-cream text-xs text-brand-brown-light uppercase">
                <th className="text-left px-4 py-3">Full Name</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Phone</th>
                <th className="text-left px-4 py-3">Linked Student(s)</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-brand-brown-light">No parents yet.</td>
                </tr>
              )}
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-brand-cream-dark hover:bg-brand-cream/40">
                  <td className="px-4 py-3 font-semibold text-brand-brown-dark">{p.full_name}</td>
                  <td className="px-4 py-3 text-brand-brown-light">{p.email || '—'}</td>
                  <td className="px-4 py-3">{p.phone || '—'}</td>
                  <td className="px-4 py-3 text-xs text-brand-brown-light">{p.linked_students || '—'}</td>
                  <td className="px-4 py-3">
                    {p.has_account
                      ? <span className="text-[11px] font-bold uppercase bg-success-700/10 text-success-700 px-2 py-0.5 rounded">✓ Active</span>
                      : <span className="text-[11px] font-bold uppercase bg-brand-cream text-brand-brown-light px-2 py-0.5 rounded">Pending</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(p)} className="text-brand-brown-light hover:text-brand-brown text-sm" title="Edit">✏️</button>
                      <button onClick={() => openLink(p)} className="text-brand-brown-light hover:text-brand-brown text-sm" title="Link to student">🔗</button>
                      <button onClick={() => handleRemove(p.id)} className="text-danger-700 hover:text-danger-700/70 text-sm" title="Remove">🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD MODAL */}
      {modal?.type === 'add' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-5">
              <div className="font-heading font-bold text-xl text-brand-brown-dark">Add New Parent / Guardian</div>
              <button onClick={() => setModal(null)} className="text-brand-brown-light text-2xl leading-none">&times;</button>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4 text-xs text-yellow-800">
              ℹ️ <strong>No login is created here.</strong> Use Account Creation to activate portal access.
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-brand-brown-dark mb-1 block">Full Name <span className="text-danger-700">*</span></label>
                <input className="border border-brand-cream-dark rounded-md px-3 py-2 text-sm w-full" placeholder="Parent/Guardian full name" value={addName} onChange={(e) => setAddName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-brand-brown-dark mb-1 block">Email Address <span className="text-brand-brown-light font-normal">(optional)</span></label>
                <input className="border border-brand-cream-dark rounded-md px-3 py-2 text-sm w-full" type="email" placeholder="parent@email.com" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-brand-brown-dark mb-1 block">Phone Number</label>
                <input className="border border-brand-cream-dark rounded-md px-3 py-2 text-sm w-full" type="tel" placeholder="080xxxxxxxx" value={addPhone} onChange={(e) => setAddPhone(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-brand-brown-dark mb-1 block">Address</label>
                <input className="border border-brand-cream-dark rounded-md px-3 py-2 text-sm w-full" placeholder="Residential address" value={addAddress} onChange={(e) => setAddAddress(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-brand-brown-dark mb-1 block">Relationship</label>
                <select className="border border-brand-cream-dark rounded-md px-3 py-2 text-sm w-full" value={addRel} onChange={(e) => setAddRel(e.target.value)}>
                  <option>Father</option>
                  <option>Mother</option>
                  <option>Guardian</option>
                  <option>Relative</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <Button variant="primary" onClick={handleAdd} disabled={busy} className="flex-1 justify-center">
                {busy ? 'Adding…' : '+ Add Parent'}
              </Button>
              <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {modal?.type === 'edit' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-5">
              <div className="font-heading font-bold text-xl text-brand-brown-dark">Edit Parent</div>
              <button onClick={() => setModal(null)} className="text-brand-brown-light text-2xl leading-none">&times;</button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-brand-brown-dark mb-1 block">Full Name</label>
                <input className="border border-brand-cream-dark rounded-md px-3 py-2 text-sm w-full" value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-brand-brown-dark mb-1 block">Email Address</label>
                <input className="border border-brand-cream-dark rounded-md px-3 py-2 text-sm w-full" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                {!modal.parent.email && (
                  <p className="text-xs text-brand-brown-light mt-1">ℹ️ Adding an email will require OTP confirmation.</p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-brand-brown-dark mb-1 block">Phone</label>
                <input className="border border-brand-cream-dark rounded-md px-3 py-2 text-sm w-full" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-brand-brown-dark mb-1 block">Address</label>
                <input className="border border-brand-cream-dark rounded-md px-3 py-2 text-sm w-full" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
              </div>
            </div>
            <Button variant="primary" onClick={handleEdit} disabled={busy} className="w-full justify-center mt-5">
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      )}

      {/* LINK MODAL */}
      {modal?.type === 'link' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <div className="font-heading font-bold text-xl text-brand-brown-dark">Link Parent to Students</div>
              <button onClick={() => setModal(null)} className="text-brand-brown-light text-2xl leading-none">&times;</button>
            </div>
            <p className="text-sm text-brand-brown-light mb-4">
              Select all children belonging to <strong className="text-brand-brown-dark">{modal.parent.full_name}</strong>:
            </p>
            <div className="max-h-72 overflow-y-auto border border-brand-cream-dark rounded-lg p-3 flex flex-col gap-1">
              {students.map((s) => (
                <label key={s.id} className="flex items-center gap-3 py-2 border-b border-brand-cream-dark cursor-pointer text-sm last:border-0">
                  <input
                    type="checkbox"
                    checked={linkedIds.includes(s.id)}
                    onChange={(e) => setLinkedIds((prev) =>
                      e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)
                    )}
                    className="accent-brand-brown w-4 h-4"
                  />
                  <span className="font-semibold text-brand-brown-dark">{s.full_name}</span>
                  <span className="text-[10px] font-bold uppercase bg-brand-cream px-2 py-0.5 rounded text-brand-brown-light">{s.class_name || '—'}</span>
                </label>
              ))}
              {students.length === 0 && (
                <p className="text-sm text-brand-brown-light text-center py-4">No students found.</p>
              )}
            </div>
            <Button variant="primary" onClick={handleLink} disabled={busy} className="w-full justify-center mt-4">
              {busy ? 'Saving…' : `Save Links (${linkedIds.length} selected)`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
