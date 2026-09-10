import { useMemo, useState } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';

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
interface StudentOption { id: string; full_name: string; admission_number: string; class_name: string }

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

function InvoiceForm({ classes, onSaved }: { classes: ClassOption[]; onSaved: (p: Payment) => void }) {
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentId, setStudentId] = useState('');
  const [feeType, setFeeType] = useState('School Fee');
  const [amount, setAmount] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [term, setTerm] = useState(TERMS[0]);
  const [session, setSession] = useState('2025/2026');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function loadStudents(id: string) {
    setClassId(id);
    setStudentId('');
    setStudents([]);
    if (!id) return;
    try {
      const data = await callAPI({ action: 'studentsByClass', classId: id });
      setStudents(data.students || []);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function submit() {
    const student = students.find((s) => s.id === studentId);
    if (!student || !feeType.trim() || !amount) {
      setError('Class, student, fee type and amount are all required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const data = await callAPI({
        action: 'createInvoice',
        studentId: student.id,
        studentName: student.full_name,
        admissionNumber: student.admission_number,
        className: student.class_name,
        feeType,
        amount: Number(amount),
        amountPaid: Number(amountPaid) || 0,
        term,
        session,
      });
      onSaved(data.invoice);
      setStudentId('');
      setAmount('');
      setAmountPaid('');
    } catch (e: any) {
      setError(e.message || 'Could not create invoice.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-5 flex flex-col gap-3">
      <div className="font-heading font-bold text-brand-brown-dark">Create Invoice</div>
      <div className="grid grid-cols-3 gap-3">
        <Select id="inv-class" label="Class" placeholder="Select Class" options={classes.map((c) => ({ value: c.id, label: `${c.name}${c.arm ? ' ' + c.arm : ''}` }))} value={classId} onChange={(e) => loadStudents(e.target.value)} />
        <Select id="inv-student" label="Student" placeholder={classId ? 'Select Student' : 'Pick a class first'} options={students.map((s) => ({ value: s.id, label: `${s.full_name} (${s.admission_number})` }))} value={studentId} onChange={(e) => setStudentId(e.target.value)} />
        <Input id="inv-feetype" label="Fee Type" value={feeType} onChange={(e) => setFeeType(e.target.value)} placeholder="e.g. School Fee" />
        <Input id="inv-amount" label="Amount (₦)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Input id="inv-paid" label="Amount Paid Now (₦, optional)" type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} />
        <Select id="inv-term" label="Term" options={TERMS.map((t) => ({ value: t, label: t }))} value={term} onChange={(e) => setTerm(e.target.value)} />
        <Input id="inv-session" label="Session" value={session} onChange={(e) => setSession(e.target.value)} />
      </div>
      {error && <div className="text-sm text-danger-700">{error}</div>}
      <Button variant="primary" onClick={submit} disabled={saving} className="self-start">
        {saving ? 'Creating…' : 'Create Invoice'}
      </Button>
    </div>
  );
}

function RecordsTab({ payments, classes }: { payments: Payment[]; classes: ClassOption[] }) {
  const [list, setList] = useState(payments);
  const [term, setTerm] = useState('');
  const [session, setSession] = useState('');
  const [className, setClassName] = useState('');
  const [search, setSearch] = useState('');

  const filtered = list.filter(
    (p) =>
      (!term || p.term === term) &&
      (!session || p.session === session) &&
      (!className || p.class_name === className) &&
      (!search || (p.student_name || '').toLowerCase().includes(search.toLowerCase()))
  );

  async function recordPayment(p: Payment) {
    const input = prompt(`Amount paid for ${p.student_name} (${p.fee_type})?`, String(p.amount_paid || 0));
    if (input == null) return;
    try {
      const data = await callAPI({ action: 'recordPayment', id: p.id, amountPaid: Number(input) });
      setList((prev) => prev.map((x) => (x.id === p.id ? { ...x, amount_paid: Number(input), status: data.status } : x)));
    } catch (e: any) {
      alert(e.message || 'Could not record payment.');
    }
  }

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
      <InvoiceForm classes={classes} onSaved={(inv) => setList((prev) => [inv, ...prev])} />
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
                  <button onClick={() => recordPayment(p)} className="text-brand-brown hover:underline">Record Payment</button>
                  <button onClick={() => del(p.id)} className="text-danger-700 hover:underline">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
