import { useState } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';

interface ClassOption { id: string; label: string }

interface StudentRecord {
  id?: string;
  surname?: string;
  first_name?: string;
  other_names?: string;
  email?: string;
  class_id?: string;
  gender?: string;
  student_type?: string;
  date_of_birth?: string;
  address?: string;
  parent_name?: string;
  parent_phone?: string;
  parent_address?: string;
  scholarship?: boolean;
}

interface Props {
  classes: ClassOption[];
  student?: StudentRecord | null; // undefined/null = register mode
  onClose: () => void;
  onSaved: () => void;
}

export default function StudentFormModal({ classes, student, onClose, onSaved }: Props) {
  const isEdit = !!student?.id;
  const [f, setF] = useState<StudentRecord>({
    surname: student?.surname || '',
    first_name: student?.first_name || '',
    other_names: student?.other_names || '',
    email: student?.email || '',
    class_id: student?.class_id || '',
    gender: student?.gender || 'Male',
    student_type: student?.student_type || 'new',
    date_of_birth: student?.date_of_birth || '',
    address: student?.address || '',
    parent_name: student?.parent_name || '',
    parent_phone: student?.parent_phone || '',
    parent_address: student?.parent_address || '',
    scholarship: student?.scholarship || false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set<K extends keyof StudentRecord>(key: K, val: StudentRecord[K]) {
    setF((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!f.surname?.trim()) { setError('Surname is required.'); return; }
    if (!f.class_id) { setError('Class is required.'); return; }
    const cls = classes.find((c) => c.id === f.class_id);

    setSaving(true);
    try {
      const res = await fetch('/api/admin/students/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: isEdit ? 'update' : 'create',
          id: student?.id,
          fields: { ...f, class_name: cls?.label || '' },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Save failed.');
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-lg max-w-[640px] w-full p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold text-xl text-brand-brown-dark">
            {isEdit ? 'Edit Student' : 'Register New Student / Pupil'}
          </h3>
          <button onClick={onClose} className="text-2xl text-brand-brown-light leading-none">&times;</button>
        </div>

        {!isEdit && (
          <p className="text-xs bg-amber-50 text-amber-800 rounded-md px-3 py-2">
            No login credentials are created here. Use Account Creation to assign admission numbers and passwords.
          </p>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
          <Input id="ns-surname" label="Surname *" value={f.surname} onChange={(e) => set('surname', e.target.value)} placeholder="e.g. Okon" />
          <Input id="ns-firstname" label="First Name (if 3 names)" value={f.first_name} onChange={(e) => set('first_name', e.target.value)} placeholder="e.g. John" />
          <div className="col-span-2">
            <Input id="ns-othername" label="Other Names" value={f.other_names} onChange={(e) => set('other_names', e.target.value)} placeholder="e.g. Emmanuel" />
          </div>
          <div className="col-span-2">
            <Input id="ns-email" label="Email Address (optional)" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="student@email.com" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-brand-brown-dark">Gender</label>
            <select value={f.gender} onChange={(e) => set('gender', e.target.value)} className="font-body text-sm rounded-sm border border-brand-cream-dark px-3 py-2 bg-white">
              <option>Male</option><option>Female</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-brand-brown-dark">Student Status</label>
            <select value={f.student_type} onChange={(e) => set('student_type', e.target.value)} className="font-body text-sm rounded-sm border border-brand-cream-dark px-3 py-2 bg-white">
              <option value="new">✦ New Student / Pupil</option>
              <option value="old">↩ Old / Returning Student</option>
            </select>
          </div>
          <Input id="ns-dob" label="Date of Birth" type="date" value={f.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-brand-brown-dark">Class</label>
            <select value={f.class_id} onChange={(e) => set('class_id', e.target.value)} className="font-body text-sm rounded-sm border border-brand-cream-dark px-3 py-2 bg-white">
              <option value="">Select Class</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>

          <div className="col-span-2"><Input id="ns-address" label="Residential Address" value={f.address} onChange={(e) => set('address', e.target.value)} placeholder="Student's home address" /></div>
          <Input id="ns-par" label="Parent / Guardian Full Name" value={f.parent_name} onChange={(e) => set('parent_name', e.target.value)} />
          <Input id="ns-phn" label="Parent / Guardian Phone" type="tel" value={f.parent_phone} onChange={(e) => set('parent_phone', e.target.value)} placeholder="080xxxxxxxx" />
          <div className="col-span-2"><Input id="ns-par-address" label="Parent / Guardian Address" value={f.parent_address} onChange={(e) => set('parent_address', e.target.value)} /></div>

          <label className="col-span-2 flex items-center gap-2 text-sm px-3 py-2.5 border-2 rounded-md cursor-pointer" style={{ borderColor: f.scholarship ? '#7C3AED' : undefined }}>
            <input type="checkbox" checked={f.scholarship} onChange={(e) => set('scholarship', e.target.checked)} className="w-4 h-4" style={{ accentColor: '#7C3AED' }} />
            <span className="font-semibold">Scholarship Student</span>
            <span className="text-xs text-brand-brown-light">— Fees not auto-added to invoices unless overridden</span>
          </label>

          {error && <p className="col-span-2 text-sm text-danger-700">{error}</p>}

          <div className="col-span-2 flex gap-2 pt-1">
            <Button type="submit" variant="gold" disabled={saving} className="flex-1 justify-center">
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Register Student'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
