import { useState } from 'react';
import Button from '../ui/Button';

interface ClassOption { id: string; label: string }

interface StudentRow {
  student: { id: string; full_name: string; admission_number?: string; class_name?: string };
  totalInvoice: number;
  totalPaid: number;
}
interface ApplicantRow {
  student_name?: string;
  admission_number?: string;
  class_name?: string;
  amount?: string | number;
  amount_paid?: string | number;
  payment_method?: string;
  status?: string;
}

interface Props {
  classes: ClassOption[];
  defaultSession: string;
  defaultTerm: string;
}

function naira(n: number) {
  return '₦' + n.toLocaleString();
}

function StatCard({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) {
  return (
    <div className="rounded-lg p-3.5" style={{ background: bg }}>
      <div className="text-xs font-medium" style={{ color }}>{label}</div>
      <div className="text-xl font-heading font-bold mt-1" style={{ color }}>{value}</div>
    </div>
  );
}

export default function FeeReceiptsManager({ classes, defaultSession, defaultTerm }: Props) {
  const [classId, setClassId] = useState('');
  const [session, setSession] = useState(defaultSession);
  const [term, setTerm] = useState(defaultTerm);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'students' | 'applicants' | null>(null);
  const [studentRows, setStudentRows] = useState<StudentRow[]>([]);
  const [applicantRows, setApplicantRows] = useState<ApplicantRow[]>([]);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/fee-receipts/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, session, term }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load.');
      setMode(data.mode);
      if (data.mode === 'applicants') setApplicantRows(data.rows);
      else setStudentRows(data.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }

  const grandInvoice = mode === 'students'
    ? studentRows.reduce((s, r) => s + r.totalInvoice, 0)
    : applicantRows.reduce((s, r) => s + (parseFloat(String(r.amount)) || 0), 0);
  const grandPaid = mode === 'students'
    ? studentRows.reduce((s, r) => s + r.totalPaid, 0)
    : applicantRows.reduce((s, r) => s + (parseFloat(String(r.amount_paid)) || 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-lg border border-brand-cream-dark p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className="text-sm rounded-sm border border-brand-cream-dark px-3 py-2 max-w-[220px]">
            <option value="">All Classes</option>
            <option value="__applicants__">🎓 Admission Applicants (not yet enrolled)</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <input value={session} onChange={(e) => setSession(e.target.value)} placeholder="Session e.g. 2024/2025" className="text-sm rounded-sm border border-brand-cream-dark px-3 py-2 max-w-[150px]" />
          <select value={term} onChange={(e) => setTerm(e.target.value)} className="text-sm rounded-sm border border-brand-cream-dark px-3 py-2 max-w-[150px]">
            <option value="">All Terms</option>
            <option>1st Term</option><option>2nd Term</option><option>3rd Term</option>
          </select>
          <Button type="button" variant="gold" onClick={load} disabled={loading}>{loading ? 'Loading…' : '🔍 Load'}</Button>
        </div>
      </div>

      {error && <p className="text-sm text-danger-700">{error}</p>}

      {mode === null && !loading && (
        <div className="text-center py-10 text-brand-brown-light">Select filters and click Load.</div>
      )}

      {mode === 'applicants' && (
        <>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))' }}>
            <StatCard label="Applicants" value={String(applicantRows.length)} color="#5D4037" bg="#F5EDE3" />
            <StatCard label="Total Invoice" value={naira(grandInvoice)} color="#2563EB" bg="#DBEAFE" />
            <StatCard label="Total Paid" value={naira(grandPaid)} color="#16A34A" bg="#DCFCE7" />
            <StatCard label="Balance" value={naira(grandInvoice - grandPaid)} color="#D97706" bg="#FEF3C7" />
          </div>
          <div className="bg-white rounded-lg border border-brand-cream-dark overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 780 }}>
              <thead>
                <tr className="text-left text-xs text-brand-brown-light border-b border-brand-cream-dark">
                  <th className="px-4 py-2">Name</th><th className="px-4 py-2">Adm No</th><th className="px-4 py-2">Class Applied</th>
                  <th className="px-4 py-2">Amount Due</th><th className="px-4 py-2">Amount Paid</th><th className="px-4 py-2">Balance</th>
                  <th className="px-4 py-2">Method</th><th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {applicantRows.length === 0 && <tr><td colSpan={8} className="text-center py-7 text-brand-brown-light">No admission payments found.</td></tr>}
                {applicantRows.map((p, i) => {
                  const inv = parseFloat(String(p.amount)) || 0, pd = parseFloat(String(p.amount_paid)) || 0, bal = inv - pd;
                  return (
                    <tr key={i} className="border-b border-brand-cream-dark last:border-0">
                      <td className="px-4 py-2 font-semibold">{p.student_name || '—'}</td>
                      <td className="px-4 py-2 text-brand-brown-light">{p.admission_number || '—'}</td>
                      <td className="px-4 py-2"><span className="text-[10.5px] rounded-full px-1.5 py-0.5 bg-brand-cream">{p.class_name || '—'}</span></td>
                      <td className="px-4 py-2 font-bold" style={{ color: '#2563EB' }}>{naira(inv)}</td>
                      <td className="px-4 py-2 font-bold" style={{ color: '#16A34A' }}>{naira(pd)}</td>
                      <td className="px-4 py-2 font-bold" style={{ color: bal > 0 ? '#D97706' : '#16A34A' }}>{naira(bal)}</td>
                      <td className="px-4 py-2">{p.payment_method || '—'}</td>
                      <td className="px-4 py-2">{p.status || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {mode === 'students' && (
        <>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))' }}>
            <StatCard label="Students" value={String(studentRows.length)} color="#5D4037" bg="#F5EDE3" />
            <StatCard label="Total Invoice" value={naira(grandInvoice)} color="#2563EB" bg="#DBEAFE" />
            <StatCard label="Total Paid" value={naira(grandPaid)} color="#16A34A" bg="#DCFCE7" />
            <StatCard label="Balance" value={naira(grandInvoice - grandPaid)} color="#D97706" bg="#FEF3C7" />
          </div>
          <p className="text-xs bg-amber-50 text-amber-800 rounded-md px-3 py-2">
            Invoice/Receipt PDF download buttons aren't wired up yet — that's a separate PDF-generation pass (school letterhead, signatures/stamps, line items). This screen covers the live data and totals.
          </p>
          <div className="bg-white rounded-lg border border-brand-cream-dark overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 700 }}>
              <thead>
                <tr className="text-left text-xs text-brand-brown-light border-b border-brand-cream-dark">
                  <th className="px-4 py-2">Name</th><th className="px-4 py-2">Adm No</th><th className="px-4 py-2">Class</th>
                  <th className="px-4 py-2">Total Invoice</th><th className="px-4 py-2">Total Paid</th><th className="px-4 py-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                {studentRows.length === 0 && <tr><td colSpan={6} className="text-center py-7 text-brand-brown-light">No students found.</td></tr>}
                {studentRows.map(({ student: s, totalInvoice, totalPaid }) => {
                  const bal = totalInvoice - totalPaid;
                  return (
                    <tr key={s.id} className="border-b border-brand-cream-dark last:border-0">
                      <td className="px-4 py-2 font-semibold">{s.full_name}</td>
                      <td className="px-4 py-2 text-brand-brown-light">{s.admission_number || '—'}</td>
                      <td className="px-4 py-2"><span className="text-[10.5px] rounded-full px-1.5 py-0.5 bg-brand-cream">{s.class_name || '—'}</span></td>
                      <td className="px-4 py-2 font-bold" style={{ color: '#2563EB' }}>{naira(totalInvoice)}</td>
                      <td className="px-4 py-2 font-bold" style={{ color: '#16A34A' }}>{naira(totalPaid)}</td>
                      <td className="px-4 py-2 font-bold" style={{ color: bal > 0 ? '#D97706' : '#16A34A' }}>{naira(bal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
