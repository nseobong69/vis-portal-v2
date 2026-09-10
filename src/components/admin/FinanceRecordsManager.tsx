import { useMemo, useState } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Modal from '../ui/Modal';

interface Payment {
  id: string;
  student_name: string | null;
  admission_number: string | null;
  class_name: string | null;
  fee_type: string;
  amount: number;
  amount_paid: number | null;
  status: string;
  term: string;
  session: string;
}
interface ClassOption { id: string; name: string; arm: string | null }
interface Expenditure { id: string; reason: string; date: string; amount: number; recorded_by: string | null }
interface StudentOption { id: string; full_name: string; admission_number: string; class_name: string; student_type?: string | null }

interface Props {
  payments: Payment[];
  classes: ClassOption[];
  expenditures: Expenditure[];
}

const TERMS = ['1st Term', '2nd Term', '3rd Term'];
const STATUS_STYLE: Record<string, string> = {
  paid: 'bg-success-700/10 text-success-700',
  partial: 'bg-warning-700/10 text-warning-700',
  unpaid: 'bg-danger-700/10 text-danger-700',
};

async function callAPI(payload: object) {
  const res = await fetch('/api/admin/finance/mutate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

/**
 * Ports showFeeModal()'s real flow (index.html ~13098): pick a class,
 * every student in it loads with a checkbox, an "Apply to All Selected"
 * bar sets fee type + New-student / Old-student amounts + payment mode
 * in one shot, then a single Save creates one invoice per checked
 * student. Replaces the old single-student-only dropdown form.
 */
function InvoiceForm({ classes, onSaved }: { classes: ClassOption[]; onSaved: (invoices: Payment[]) => void }) {
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [perStudentAmount, setPerStudentAmount] = useState<Record<string, string>>({});
  const [feeType, setFeeType] = useState('School Fee');
  const [amountNew, setAmountNew] = useState('');
  const [amountOld, setAmountOld] = useState('');
  const [paymentMode, setPaymentMode] = useState<'invoice' | 'full' | 'part'>('invoice');
  const [partAmount, setPartAmount] = useState('');
  const [term, setTerm] = useState(TERMS[0]);
  const [session, setSession] = useState('2025/2026');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);

  async function loadStudents(id: string) {
    setClassId(id);
    setSelected(new Set());
    setPerStudentAmount({});
    setStudents([]);
    setError('');
    if (!id) return;
    setLoadingStudents(true);
    try {
      const data = await callAPI({ action: 'studentsByClass', classId: id });
      setStudents(data.students || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingStudents(false);
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => (prev.size === students.length ? new Set() : new Set(students.map((s) => s.id))));
  }

  // "Apply to All Selected" — resolves New vs Old student amount per
  // selected row, same distinction the old app makes via student_type.
  function applyToSelected() {
    const next: Record<string, string> = { ...perStudentAmount };
    students.forEach((s) => {
      if (!selected.has(s.id)) return;
      const isNew = (s.student_type || '').toLowerCase() === 'new';
      const amt = isNew ? amountNew : amountOld || amountNew;
      if (amt) next[s.id] = amt;
    });
    setPerStudentAmount(next);
  }

  const selectedCount = selected.size;

  async function submit() {
    const targets = students
      .filter((s) => selected.has(s.id))
      .map((s) => {
        const isNew = (s.student_type || '').toLowerCase() === 'new';
        // Resolve the same way "Apply to All Selected" would, even if
        // that button was never explicitly clicked — a per-row value
        // always wins if the user typed one in directly. Was:
        // Number(perStudentAmount[s.id]) || 0, which silently fell back
        // to the Apply-to-All bar's fields never being read at submit
        // time at all — if Apply wasn't clicked, every row stayed
        // blank no matter what New/Old Student said.
        const raw = perStudentAmount[s.id] !== undefined && perStudentAmount[s.id] !== ''
          ? perStudentAmount[s.id]
          : (isNew ? amountNew : (amountOld || amountNew));
        const amount = raw !== '' && raw != null ? Number(raw) : NaN;
        return {
          studentId: s.id,
          studentName: s.full_name,
          admissionNumber: s.admission_number,
          className: s.class_name,
          amount,
          amountPaid:
            paymentMode === 'full' ? amount
            : paymentMode === 'part' ? Number(partAmount) || 0
            : 0,
        };
      });
    if (!targets.length) {
      setError('Select at least one student.');
      return;
    }
    // 0 is a legitimate amount (e.g. "New students pay ₦0 this term") —
    // was previously rejected because `!t.amount` treats 0 as falsy.
    // Only a genuinely unresolved (NaN) or negative amount is invalid.
    if (!feeType.trim() || targets.some((t) => isNaN(t.amount) || t.amount < 0)) {
      setError('Fee type is required, and every selected student needs an amount — 0 is allowed. Set New Student / Old Student above, or per row.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const data = await callAPI({ action: 'createInvoicesBulk', targets, feeType, term, session });
      onSaved(data.invoices || []);
      setSelected(new Set());
      setPerStudentAmount({});
    } catch (e: any) {
      setError(e.message || 'Could not create invoices.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-5 flex flex-col gap-4">
      <div className="font-heading font-bold text-brand-brown-dark">Create Invoice</div>
      <p className="text-xs text-brand-brown-light -mt-2">Select a class, choose students, set fee details, then save invoices for all selected at once.</p>

      <div className="grid grid-cols-3 gap-3">
        <Select id="inv-class" label="Class" placeholder="Select Class" options={classes.map((c) => ({ value: c.id, label: `${c.name}${c.arm ? ' ' + c.arm : ''}` }))} value={classId} onChange={(e) => loadStudents(e.target.value)} />
        <Select id="inv-term" label="Term" options={TERMS.map((t) => ({ value: t, label: t }))} value={term} onChange={(e) => setTerm(e.target.value)} />
        <Input id="inv-session" label="Session" value={session} onChange={(e) => setSession(e.target.value)} />
      </div>

      {classId && (
        <>
          <div className="bg-brand-cream rounded-lg p-4 flex flex-col gap-3">
            <div className="text-xs font-bold text-brand-brown-light uppercase tracking-wide">Apply to All Selected</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
              <Input id="inv-feetype" label="Fee Type" value={feeType} onChange={(e) => setFeeType(e.target.value)} placeholder="e.g. School Fee" />
              <Input id="inv-new" label="New Student (₦)" type="number" value={amountNew} onChange={(e) => setAmountNew(e.target.value)} />
              <Input id="inv-old" label="Old Student (₦)" type="number" value={amountOld} onChange={(e) => setAmountOld(e.target.value)} />
              <Select id="inv-mode" label="Payment Mode" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as any)} options={[
                { value: 'invoice', label: 'Invoice Only' },
                { value: 'full', label: 'Full Payment — Paid' },
                { value: 'part', label: 'Part Payment' },
              ]} />
            </div>
            {paymentMode === 'part' && (
              <Input id="inv-partamt" label="Part Payment Amount (₦, applies to each selected student)" type="number" value={partAmount} onChange={(e) => setPartAmount(e.target.value)} />
            )}
            <Button variant="secondary" onClick={applyToSelected} className="self-start text-xs">Apply to {selectedCount || 'Selected'} Student{selectedCount === 1 ? '' : 's'}</Button>
          </div>

          <div className="border border-brand-cream-dark rounded-lg max-h-80 overflow-y-auto">
            {loadingStudents ? (
              <div className="text-center py-8 text-sm text-brand-brown-light">Loading students…</div>
            ) : students.length === 0 ? (
              <div className="text-center py-8 text-sm text-brand-brown-light">No students found in this class.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-brand-cream text-xs uppercase text-brand-brown-light sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left w-8"><input type="checkbox" checked={selectedCount === students.length} onChange={toggleAll} /></th>
                    <th className="px-3 py-2 text-left">Student</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Amount (₦)</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id} className="border-t border-brand-cream-dark">
                      <td className="px-3 py-2"><input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleOne(s.id)} /></td>
                      <td className="px-3 py-2 font-medium text-brand-brown-dark">{s.full_name} <span className="text-brand-brown-light font-normal">({s.admission_number})</span></td>
                      <td className="px-3 py-2 text-brand-brown-light">{s.student_type || '—'}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          className="w-28 rounded border border-brand-cream-dark px-2 py-1"
                          value={perStudentAmount[s.id] || ''}
                          onChange={(e) => setPerStudentAmount((prev) => ({ ...prev, [s.id]: e.target.value }))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs text-brand-brown-light">{selectedCount} student{selectedCount === 1 ? '' : 's'} selected</div>
            {error && <div className="text-sm text-danger-700">{error}</div>}
            <Button variant="primary" onClick={submit} disabled={saving}>
              {saving ? 'Creating…' : `Create ${selectedCount || ''} Invoice${selectedCount === 1 ? '' : 's'}`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Replaces the old prompt()-based flow with a real modal, matching the
 * old app's own dedicated "Record Payment — {name}" screen. */
function RecordPaymentModal({ payment, onClose, onSaved }: { payment: Payment; onClose: () => void; onSaved: (status: string, amountPaid: number) => void }) {
  const [amountPaid, setAmountPaid] = useState(String(payment.amount_paid || ''));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const balance = Math.max(0, Number(payment.amount) - (Number(amountPaid) || 0));

  async function submit() {
    if (amountPaid === '' || Number(amountPaid) < 0) {
      setError('Enter a valid amount.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const data = await callAPI({ action: 'recordPayment', id: payment.id, amountPaid: Number(amountPaid) });
      onSaved(data.status, Number(amountPaid));
    } catch (e: any) {
      setError(e.message || 'Could not record payment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Record Payment — ${payment.student_name}`}>
      <div className="flex flex-col gap-3 min-w-[280px]">
        <div className="text-sm text-brand-brown-light">{payment.fee_type} · {payment.class_name} · Invoice total ₦{Number(payment.amount).toLocaleString()}</div>
        <Input id="rp-amount" label="Amount Paid (₦)" type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} />
        <div className="text-sm text-brand-brown-light">Balance remaining: <strong className="text-brand-brown-dark">₦{balance.toLocaleString()}</strong></div>
        {error && <div className="text-sm text-danger-700">{error}</div>}
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save Payment'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function RecordsTab({ payments, classes }: { payments: Payment[]; classes: ClassOption[] }) {
  const [list, setList] = useState(payments);
  const [term, setTerm] = useState('');
  const [session, setSession] = useState('');
  const [className, setClassName] = useState('');
  const [search, setSearch] = useState('');
  const [payingId, setPayingId] = useState<string | null>(null);

  const filtered = list.filter(
    (p) =>
      (!term || p.term === term) &&
      (!session || p.session === session) &&
      (!className || p.class_name === className) &&
      (!search || (p.student_name || '').toLowerCase().includes(search.toLowerCase()))
  );

  const payingRecord = list.find((p) => p.id === payingId) || null;

  async function del(id: string) {
    if (!confirm('Delete this invoice?')) return;
    try {
      await callAPI({ action: 'deleteInvoice', id });
      setList((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) {
      alert(e.message || 'Could not delete.');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <InvoiceForm classes={classes} onSaved={(invoices) => setList((prev) => [...invoices, ...prev])} />
      <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-4 flex flex-wrap gap-3 items-end">
        <Select id="fr-term" label="Term" placeholder="All Terms" options={TERMS.map((t) => ({ value: t, label: t }))} value={term} onChange={(e) => setTerm(e.target.value)} />
        <Input id="fr-search" label="Student name" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" />
        <Select id="fr-class" label="Class" placeholder="All Classes" options={classes.map((c) => ({ value: `${c.name}${c.arm ? ' ' + c.arm : ''}`, label: `${c.name}${c.arm ? ' ' + c.arm : ''}` }))} value={className} onChange={(e) => setClassName(e.target.value)} />
      </div>
      <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-brand-cream text-xs uppercase text-brand-brown-light">
            <tr>
              <th className="text-left px-4 py-2.5">Student</th>
              <th className="text-left px-4 py-2.5">Class</th>
              <th className="text-left px-4 py-2.5">Fee</th>
              <th className="text-left px-4 py-2.5">Amount</th>
              <th className="text-left px-4 py-2.5">Paid</th>
              <th className="text-left px-4 py-2.5">Status</th>
              <th className="text-left px-4 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center px-4 py-8 text-brand-brown-light">No fee records match this filter.</td></tr>
            )}
            {filtered.map((p) => (
              <tr key={p.id} className="border-t border-brand-cream-dark">
                <td className="px-4 py-2.5 font-medium text-brand-brown-dark">{p.student_name}</td>
                <td className="px-4 py-2.5">{p.class_name}</td>
                <td className="px-4 py-2.5">{p.fee_type}</td>
                <td className="px-4 py-2.5">₦{Number(p.amount).toLocaleString()}</td>
                <td className="px-4 py-2.5">₦{Number(p.amount_paid || 0).toLocaleString()}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[p.status] || ''}`}>{p.status}</span>
                </td>
                <td className="px-4 py-2.5 flex gap-3">
                  <button onClick={() => setPayingId(p.id)} className="text-brand-brown hover:underline">Record Payment</button>
                  <button onClick={() => del(p.id)} className="text-danger-700 hover:underline">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {payingRecord && (
        <RecordPaymentModal
          payment={payingRecord}
          onClose={() => setPayingId(null)}
          onSaved={(status, amountPaid) => {
            setList((prev) => prev.map((x) => (x.id === payingRecord.id ? { ...x, amount_paid: amountPaid, status } : x)));
            setPayingId(null);
          }}
        />
      )}
    </div>
  );
}

function SummaryTab({ payments }: { payments: Payment[] }) {
  const stats = useMemo(() => {
    const totalDue = payments.reduce((a, p) => a + Number(p.amount), 0);
    const totalPaid = payments.reduce((a, p) => a + Number(p.amount_paid || 0), 0);
    const paid = payments.filter((p) => p.status === 'paid').length;
    const partial = payments.filter((p) => p.status === 'partial').length;
    const unpaid = payments.filter((p) => p.status === 'unpaid').length;
    return { totalDue, totalPaid, paid, partial, unpaid, count: payments.length };
  }, [payments]);

  const pct = (n: number) => (stats.count ? Math.round((n / stats.count) * 100) : 0);

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-5">
        <div className="text-sm text-brand-brown-light">Total Expected</div>
        <div className="text-2xl font-bold text-brand-brown-dark">₦{stats.totalDue.toLocaleString()}</div>
      </div>
      <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-5">
        <div className="text-sm text-brand-brown-light">Total Collected</div>
        <div className="text-2xl font-bold text-success-700">₦{stats.totalPaid.toLocaleString()}</div>
      </div>
      <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-5 col-span-2">
        <div className="font-heading font-bold text-brand-brown-dark mb-3">Invoice Status ({stats.count} invoices)</div>
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between"><span>Fully Paid</span><span className="text-success-700 font-semibold">{pct(stats.paid)}% ({stats.paid})</span></div>
          <div className="flex justify-between"><span>Part Payment</span><span className="text-warning-700 font-semibold">{pct(stats.partial)}% ({stats.partial})</span></div>
          <div className="flex justify-between"><span>Unpaid</span><span className="text-danger-700 font-semibold">{pct(stats.unpaid)}% ({stats.unpaid})</span></div>
        </div>
      </div>
    </div>
  );
}

function ExpenditureTab({ expenditures }: { expenditures: Expenditure[] }) {
  const [list, setList] = useState(expenditures);
  const [reason, setReason] = useState('');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setError('');
    try {
      const data = await callAPI({ action: 'addExpenditure', reason, date, expAmount: Number(amount) });
      setList((prev) => [data.expenditure, ...prev]);
      setReason('');
      setDate('');
      setAmount('');
    } catch (e: any) {
      setError(e.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  async function del(id: string) {
    if (!confirm('Delete this expenditure entry?')) return;
    try {
      await callAPI({ action: 'deleteExpenditure', id });
      setList((prev) => prev.filter((e) => e.id !== id));
    } catch (e: any) {
      alert(e.message || 'Could not delete.');
    }
  }

  const total = list.reduce((a, e) => a + Number(e.amount), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-5 flex flex-col gap-3">
        <div className="font-heading font-bold text-brand-brown-dark">Add Expenditure</div>
        <div className="grid grid-cols-3 gap-3">
          <Input id="exp-reason" label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Generator fuel" />
          <Input id="exp-date" label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input id="exp-amount" label="Amount (₦)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        {error && <div className="text-sm text-danger-700">{error}</div>}
        <Button variant="primary" onClick={submit} disabled={saving} className="self-start">
          {saving ? 'Saving…' : 'Add Expenditure'}
        </Button>
      </div>

      <div className="text-sm text-brand-brown-light">Total recorded: <strong className="text-brand-brown-dark">₦{total.toLocaleString()}</strong></div>

      <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-brand-cream text-xs uppercase text-brand-brown-light">
            <tr>
              <th className="text-left px-4 py-2.5">Reason</th>
              <th className="text-left px-4 py-2.5">Date</th>
              <th className="text-left px-4 py-2.5">Amount</th>
              <th className="text-left px-4 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={4} className="text-center px-4 py-8 text-brand-brown-light">No expenditure records yet.</td></tr>}
            {list.map((e) => (
              <tr key={e.id} className="border-t border-brand-cream-dark">
                <td className="px-4 py-2.5">{e.reason}</td>
                <td className="px-4 py-2.5">{e.date}</td>
                <td className="px-4 py-2.5">₦{Number(e.amount).toLocaleString()}</td>
                <td className="px-4 py-2.5"><button onClick={() => del(e.id)} className="text-danger-700 hover:underline">Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function FinanceRecordsManager({ payments, classes, expenditures }: Props) {
  const [tab, setTab] = useState<0 | 1 | 2>(0);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 bg-brand-cream rounded-xl p-1 w-fit">
        {['Fee Records', 'Fee Summary', 'Expenditure'].map((label, i) => (
          <button
            key={label}
            onClick={() => setTab(i as 0 | 1 | 2)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === i ? 'bg-white shadow-sm text-brand-brown-dark' : 'text-brand-brown-light'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 0 && <RecordsTab payments={payments} classes={classes} />}
      {tab === 1 && <SummaryTab payments={payments} />}
      {tab === 2 && <ExpenditureTab expenditures={expenditures} />}
    </div>
  );
}
