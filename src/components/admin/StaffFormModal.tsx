import { useState } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';

const ADD_ROLES = [
  { v: 'teacher', l: 'Teacher' },
  { v: 'subject_teacher', l: 'Subject Teacher' },
  { v: 'admin', l: 'Admin' },
  { v: 'bursar', l: 'Bursar' },
  { v: 'head_teacher', l: 'Head Teacher' },
  { v: 'principal', l: 'Principal' },
  { v: 'proprietor', l: 'School Director' },
];
// editStaff() offers super_admin too (index.html ~8656) — add form doesn't.
const EDIT_ROLES = [...ADD_ROLES, { v: 'super_admin', l: 'Super Admin' }];

export interface StaffRecord {
  id?: string;
  full_name?: string;
  phone?: string;
  email?: string;
  roles?: string[];
  staff_code?: string;
  basic_salary?: number;
  allowance_housing?: number;
  allowance_transport?: number;
  allowance_other?: number;
  deduction_tax?: number;
  deduction_pension?: number;
  deduction_other?: number;
  staff_bank_name?: string;
  staff_bank_account_number?: string;
  staff_bank_account_name?: string;
}

interface Props {
  staff?: StaffRecord | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function StaffFormModal({ staff, onClose, onSaved }: Props) {
  const isEdit = !!staff?.id;
  const [name, setName] = useState(staff?.full_name || '');
  const [phone, setPhone] = useState(staff?.phone || '');
  const [email, setEmail] = useState(staff?.email || '');
  const [code, setCode] = useState(staff?.staff_code || '');
  const [roles, setRoles] = useState<string[]>(staff?.roles || []);
  const [pay, setPay] = useState({
    basic_salary: staff?.basic_salary || 0,
    allowance_housing: staff?.allowance_housing || 0,
    allowance_transport: staff?.allowance_transport || 0,
    allowance_other: staff?.allowance_other || 0,
    deduction_tax: staff?.deduction_tax || 0,
    deduction_pension: staff?.deduction_pension || 0,
    deduction_other: staff?.deduction_other || 0,
  });
  const [bank, setBank] = useState({
    staff_bank_name: staff?.staff_bank_name || '',
    staff_bank_account_number: staff?.staff_bank_account_number || '',
    staff_bank_account_name: staff?.staff_bank_account_name || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function toggleRole(v: string) {
    setRoles((prev) => (prev.includes(v) ? prev.filter((r) => r !== v) : [...prev, v]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Full name is required.'); return; }
    if (!roles.length) { setError('Select at least one role.'); return; }

    setSaving(true);
    try {
      const fields = isEdit
        ? { full_name: name, phone, staff_code: code, roles, ...pay, ...bank }
        : { full_name: name, phone, email, roles };
      const res = await fetch('/api/admin/staff/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: isEdit ? 'update' : 'create', id: staff?.id, fields }),
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

  const roleList = isEdit ? EDIT_ROLES : ADD_ROLES;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-lg max-w-[600px] w-full p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold text-xl text-brand-brown-dark">{isEdit ? 'Edit Staff' : 'Add New Staff Member'}</h3>
          <button onClick={onClose} className="text-2xl text-brand-brown-light leading-none">&times;</button>
        </div>

        {!isEdit && (
          <p className="text-xs bg-amber-50 text-amber-800 rounded-md px-3 py-2">
            No login credentials are created here. Assign email and password via Account Creation after saving.
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input id="af-name" label="Full Name *" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name of staff member" />
          <Input id="af-phone" label="Phone Number" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="080xxxxxxxx" />
          {isEdit ? (
            <Input id="esf-code" label="Staff Code" value={code} onChange={(e) => setCode(e.target.value)} />
          ) : (
            <Input id="af-email" label="Email Address (optional — required for portal login)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@vis.edu" />
          )}

          <div>
            <label className="text-sm font-medium text-brand-brown-dark">Role{isEdit ? '(s)' : ' * (select all that apply)'}</label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {roleList.map((r) => (
                <label key={r.v} className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-brand-cream text-sm cursor-pointer">
                  <input type="checkbox" checked={roles.includes(r.v)} onChange={() => toggleRole(r.v)} className="w-4 h-4" />
                  {r.l}
                </label>
              ))}
            </div>
          </div>

          {isEdit && (
            <>
              <div className="border-t border-brand-cream-dark pt-3">
                <h4 className="text-sm font-heading font-bold text-brand-brown-dark mb-2">💳 Payroll</h4>
                <div className="grid grid-cols-2 gap-3">
                  <Input id="esf-basic" label="Basic Salary (₦)" type="number" value={pay.basic_salary} onChange={(e) => setPay((p) => ({ ...p, basic_salary: +e.target.value }))} />
                  <Input id="esf-housing" label="Housing Allowance (₦)" type="number" value={pay.allowance_housing} onChange={(e) => setPay((p) => ({ ...p, allowance_housing: +e.target.value }))} />
                  <Input id="esf-transport" label="Transport Allowance (₦)" type="number" value={pay.allowance_transport} onChange={(e) => setPay((p) => ({ ...p, allowance_transport: +e.target.value }))} />
                  <Input id="esf-otherall" label="Other Allowance (₦)" type="number" value={pay.allowance_other} onChange={(e) => setPay((p) => ({ ...p, allowance_other: +e.target.value }))} />
                  <Input id="esf-tax" label="Tax (PAYE) (₦)" type="number" value={pay.deduction_tax} onChange={(e) => setPay((p) => ({ ...p, deduction_tax: +e.target.value }))} />
                  <Input id="esf-pension" label="Pension (₦)" type="number" value={pay.deduction_pension} onChange={(e) => setPay((p) => ({ ...p, deduction_pension: +e.target.value }))} />
                  <Input id="esf-otherded" label="Other Deduction (₦)" type="number" value={pay.deduction_other} onChange={(e) => setPay((p) => ({ ...p, deduction_other: +e.target.value }))} />
                </div>
              </div>
              <div className="border-t border-brand-cream-dark pt-3">
                <h4 className="text-sm font-heading font-bold text-brand-brown-dark mb-2">🏦 Bank Details (for payslip)</h4>
                <div className="grid grid-cols-2 gap-3">
                  <Input id="esf-bankname" label="Bank Name" value={bank.staff_bank_name} onChange={(e) => setBank((b) => ({ ...b, staff_bank_name: e.target.value }))} />
                  <Input id="esf-bankacct" label="Account Number" value={bank.staff_bank_account_number} onChange={(e) => setBank((b) => ({ ...b, staff_bank_account_number: e.target.value }))} />
                  <div className="col-span-2">
                    <Input id="esf-bankaccname" label="Account Name" value={bank.staff_bank_account_name} onChange={(e) => setBank((b) => ({ ...b, staff_bank_account_name: e.target.value }))} />
                  </div>
                </div>
              </div>
            </>
          )}

          {error && <p className="text-sm text-danger-700">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button type="submit" variant="gold" disabled={saving} className="flex-1 justify-center">
              {saving ? 'Saving…' : isEdit ? 'Save' : 'Add Staff Member'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
