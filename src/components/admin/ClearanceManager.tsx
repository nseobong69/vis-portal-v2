import { useMemo, useState } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Modal from '../ui/Modal';

interface FeePayment {
  amount: number | null;
  amount_paid: number | null;
  status: string | null;
}
interface Student {
  id: string;
  full_name: string;
  admission_number: string | null;
  class_name: string | null;
  class_id: string | null;
  cleared: boolean | null;
  results_blocked: boolean | null;
  fee_payments: FeePayment[] | null;
}
interface ClassOption { id: string; name: string; arm: string | null }

interface Props {
  students: Student[];
  classes: ClassOption[];
}

const STATUS_MODE = ['paid', 'partial', 'unpaid', 'cash'] as const;

// Ports renderClearance()'s per-row math verbatim (index.html
// ~L14810-14818): a student is only "Full Payment" once `cleared` is
// actually true (not merely fully paid) — matching the old app's own
// choice to gate the badge on the manual/auto-set flag, not the raw
// balance, so a bursar's explicit Clear/Revoke always wins visually.
function computeFee(fp: FeePayment[] | null, cleared: boolean | null) {
  const pays = fp || [];
  const totalPaid = pays
    .filter((p) => p.status === 'paid' || p.status === 'partial')
    .reduce((a, p) => a + (Number(p.amount_paid ?? p.amount) || 0), 0);
  const totalDue = pays.reduce((a, p) => a + (Number(p.amount) || 0), 0);
  const balance = totalDue - totalPaid;
  let tag: 'full' | 'part' | 'none' = 'none';
  if (cleared) tag = 'full';
  else if (totalPaid > 0 && balance > 0) tag = 'part';
  return { totalPaid, balance, tag };
}

const FEE_TAG_STYLE: Record<string, string> = {
  full: 'bg-success-700/10 text-success-700',
  part: 'bg-warning-700/10 text-warning-700',
  none: 'bg-danger-700/10 text-danger-700',
};
const FEE_TAG_LABEL: Record<string, string> = {
  full: 'Full Payment',
  part: 'Part-Payment',
  none: 'Not Paid',
};

async function callAPI(payload: object) {
  const res = await fetch('/api/admin/clearance/mutate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

/** Ports showRecordPaymentModal()/savePaymentRecord() (index.html
 * ~L14841-14907) — fee type, total amount, a status select (the 'cash'
 * option shows the same "meet the Bursar in school" note the old app
 * had), and an amount-paid field that hides for unpaid/cash. */
function RecordPaymentModal({ student, onClose, onSaved }: { student: Student; onClose: () => void; onSaved: () => void }) {
  const [feeType, setFeeType] = useState('');
  const [total, setTotal] = useState('');
  const [status, setStatus] = useState<(typeof STATUS_MODE)[number]>('paid');
  const [amountPaid, setAmountPaid] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const showAmountField = status !== 'unpaid' && status !== 'cash';

  async function submit() {
    if (!feeType.trim()) return setError('Fee type is required.');
    if (!total || Number(total) <= 0) return setError('Total fee amount is required.');
    setSaving(true);
    setError('');
    try {
      await callAPI({
        action: 'recordPayment',
        studentId: student.id,
        className: student.class_name,
        feeType: feeType.trim(),
        amount: Number(total),
        amountPaid: showAmountField ? Number(amountPaid) || 0 : 0,
        status,
      });
      onSaved();
    } catch (e: any) {
      setError(e.message || 'Could not save payment record.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Record Payment — ${student.full_name}`}>
      <div className="flex flex-col gap-3 min-w-[280px]">
        <div className="grid grid-cols-2 gap-3">
          <Input id="rp-type" label="Fee Type" value={feeType} onChange={(e) => setFeeType(e.target.value)} placeholder="e.g. School Fee, PTA Levy" />
          <Input id="rp-total" label="Total Fee Amount (₦)" type="number" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="e.g. 50000" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select
            id="rp-status"
            label="Payment Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            options={[
              { value: 'paid', label: 'Full Payment' },
              { value: 'partial', label: 'Part-Payment' },
              { value: 'unpaid', label: 'Not Paid' },
              { value: 'cash', label: 'Cash (In-person)' },
            ]}
          />
          {showAmountField && (
            <Input id="rp-paid" label="Amount Paid (₦)" type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder="Amount actually paid" />
          )}
        </div>
        {status === 'cash' && (
          <div className="bg-warning-700/10 rounded-md px-3 py-2 text-xs text-warning-700">
            <strong>Cash Payment:</strong> Direct the student/parent to meet the Bursar in school to complete payment. This record is marked pending until confirmed.
          </div>
        )}
        {error && <div className="text-sm text-danger-700">{error}</div>}
        <div className="flex gap-2 mt-1">
          <Button variant="primary" onClick={submit} disabled={saving} className="flex-1 justify-center">
            {saving ? 'Saving…' : 'Save Payment Record'}
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function ClearanceManager({ students, classes }: Props) {
  const [list, setList] = useState(students);
  const [classId, setClassId] = useState('');
  const [search, setSearch] = useState('');
  const [payingId, setPayingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((s) => {
      if (classId && s.class_id !== classId) return false;
      if (!q) return true;
      return s.full_name.toLowerCase().includes(q) || (s.admission_number || '').toLowerCase().includes(q);
    });
  }, [list, classId, search]);

  const payingStudent = list.find((s) => s.id === payingId) || null;

  async function toggleCleared(s: Student) {
    setBusyId(s.id);
    setErr('');
    try {
      const next = !s.cleared;
      await callAPI({ action: 'setCleared', id: s.id, value: next });
      setList((prev) => prev.map((x) => (x.id === s.id ? { ...x, cleared: next } : x)));
    } catch (e: any) {
      setErr(e.message || 'Could not update clearance.');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleBlocked(s: Student) {
    setBusyId(s.id);
    setErr('');
    try {
      const next = !s.results_blocked;
      await callAPI({ action: 'setResultsBlocked', id: s.id, value: next });
      setList((prev) => prev.map((x) => (x.id === s.id ? { ...x, results_blocked: next } : x)));
    } catch (e: any) {
      setErr(e.message || 'Could not update results access.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-4 flex flex-wrap gap-3 items-end">
        <Select
          id="clr-class"
          label="Filter by Class"
          placeholder="All Classes"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          options={classes.map((c) => ({ value: c.id, label: `${c.name}${c.arm ? ' ' + c.arm : ''}` }))}
        />
        <Input id="clr-search" label="Search Student" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Name / Adm No…" />
      </div>

      {err && <div className="text-sm text-danger-700">{err}</div>}

      <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-brand-cream text-xs uppercase text-brand-brown-light">
              <tr>
                <th className="text-left px-4 py-2.5">Student</th>
                <th className="text-left px-4 py-2.5">Adm No</th>
                <th className="text-left px-4 py-2.5">Class</th>
                <th className="text-left px-4 py-2.5">Fee Status</th>
                <th className="text-left px-4 py-2.5">Amount Paid</th>
                <th className="text-left px-4 py-2.5">Balance</th>
                <th className="text-left px-4 py-2.5">Results</th>
                <th className="text-left px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center px-4 py-8 text-brand-brown-light">No students.</td></tr>
              )}
              {filtered.map((s) => {
                const { totalPaid, balance, tag } = computeFee(s.fee_payments, s.cleared);
                const busy = busyId === s.id;
                return (
                  <tr key={s.id} className="border-t border-brand-cream-dark">
                    <td className="px-4 py-2.5 font-medium text-brand-brown-dark">{s.full_name}</td>
                    <td className="px-4 py-2.5">{s.admission_number || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-semibold bg-brand-cream px-2 py-0.5 rounded-full">{s.class_name || '—'}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${FEE_TAG_STYLE[tag]}`}>{FEE_TAG_LABEL[tag]}</span>
                    </td>
                    <td className="px-4 py-2.5 font-semibold">₦{totalPaid.toLocaleString()}</td>
                    <td className={`px-4 py-2.5 font-semibold ${balance > 0 ? 'text-danger-700' : 'text-success-700'}`}>₦{balance.toLocaleString()}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.results_blocked ? 'bg-danger-700/10 text-danger-700' : 'bg-success-700/10 text-success-700'}`}>
                        {s.results_blocked ? 'Blocked' : 'Open'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {/* Matches StudentsManager.tsx's own action-cell convention
                          exactly (toggleBlock/del there): plain <button> elements
                          with bg-danger-700/bg-success-700 text-white directly —
                          NOT the Button component, which (confirmed via
                          DeleteButton.tsx + StudentsManager.tsx) has no 'danger'
                          variant at all. Previous version of this file guessed a
                          border-color-only style through Button; this replaces it. */}
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setPayingId(s.id)}
                          className="text-xs px-2 py-1 rounded-sm border border-brand-cream-dark hover:bg-brand-cream"
                        >
                          💵 Pay
                        </button>
                        <button
                          onClick={() => toggleCleared(s)}
                          disabled={busy}
                          className={`text-xs px-2 py-1 rounded-sm text-white disabled:opacity-50 ${s.cleared ? 'bg-danger-700' : 'bg-success-700'}`}
                        >
                          {s.cleared ? 'Revoke' : 'Clear'}
                        </button>
                        <button
                          onClick={() => toggleBlocked(s)}
                          disabled={busy}
                          className={`text-xs px-2 py-1 rounded-sm text-white disabled:opacity-50 ${s.results_blocked ? 'bg-success-700' : 'bg-danger-700'}`}
                          title={s.results_blocked ? 'Unlock results' : 'Lock results'}
                        >
                          {s.results_blocked ? '🔓' : '🔒'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {payingStudent && (
        <RecordPaymentModal
          student={payingStudent}
          onClose={() => setPayingId(null)}
          onSaved={() => {
            // Simplest consistent refresh: full reload picks up the new
            // fee_payments row + any cleared flag change from the server
            // in one shot — same net effect as the old app's own
            // `closeModal();renderClearance();` re-render-from-scratch.
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
