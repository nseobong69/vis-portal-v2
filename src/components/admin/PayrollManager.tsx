import { useMemo, useState } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { computePayLine } from '../../lib/payroll';
import { downloadPayslipPdf, type SchoolSettingsForPayslip } from '../../lib/payslipPdf';

interface StaffMember {
  id: string;
  full_name: string;
  role: string;
  basic_salary: number | null;
  allowance_housing: number | null;
  allowance_transport: number | null;
  allowance_other: number | null;
  deduction_tax: number | null;
  deduction_pension: number | null;
  deduction_other: number | null;
}
interface Payslip {
  id: string;
  staff_id: string;
  staff_name: string;
  role: string;
  period: string;
  basic_salary: number | null;
  allowance_housing: number | null;
  allowance_transport: number | null;
  allowance_other: number | null;
  gross_pay: number;
  deduction_tax: number | null;
  deduction_pension: number | null;
  deduction_other: number | null;
  total_deductions: number;
  net_pay: number;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  generated_at: string | null;
  status: 'generated' | 'paid';
}

interface Props {
  period: string;
  eligibleStaff: StaffMember[];
  initialSlips: Payslip[];
  schoolSettings: SchoolSettingsForPayslip;
}

function fmtMoney(n: number) {
  return `₦${(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function periodLabel(period: string) {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

async function callAPI(payload: object) {
  const res = await fetch('/api/admin/payroll/mutate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

export default function PayrollManager({ period, eligibleStaff, initialSlips, schoolSettings }: Props) {
  const [slips, setSlips] = useState(initialSlips);
  const [search, setSearch] = useState('');
  const [generating, setGenerating] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const slipMap = useMemo(() => {
    const m: Record<string, Payslip> = {};
    slips.forEach((s) => (m[s.staff_id] = s));
    return m;
  }, [slips]);

  const totalNet = slips.reduce((a, s) => a + (Number(s.net_pay) || 0), 0);
  const paidCount = slips.filter((s) => s.status === 'paid').length;

  const filtered = eligibleStaff.filter((s) => !search || s.full_name.toLowerCase().includes(search.toLowerCase()));

  function changePeriod(newPeriod: string) {
    window.location.href = `/admin/payroll?period=${newPeriod}`;
  }

  async function generate() {
    setGenerating(true);
    setStatus('');
    try {
      const data = await callAPI({ action: 'generate', period });
      setSlips(data.slips);
      setStatus(`Generated ${data.created} payslip(s)${data.skipped ? `, ${data.skipped} already existed` : ''}${data.errors?.length ? ` — ${data.errors.length} failed` : ''}.`);
    } catch (e: any) {
      setStatus(e.message || 'Could not generate payroll.');
    } finally {
      setGenerating(false);
    }
  }

  async function markPaid(id: string) {
    setMarking(id);
    try {
      await callAPI({ action: 'markPaid', id });
      setSlips((prev) => prev.map((s) => (s.id === id ? { ...s, status: 'paid' } : s)));
    } catch (e: any) {
      alert(e.message || 'Could not mark as paid.');
    } finally {
      setMarking(null);
    }
  }

  async function markAllPaid() {
    if (!confirm('Mark all generated payslips for this period as paid?')) return;
    try {
      const data = await callAPI({ action: 'markAllPaid', period });
      setSlips(data.slips);
    } catch (e: any) {
      alert(e.message || 'Could not mark all as paid.');
    }
  }

  async function download(slip: Payslip) {
    setDownloading(slip.id);
    try {
      await downloadPayslipPdf(slip, schoolSettings);
    } catch (e: any) {
      alert(e.message || 'Could not generate the payslip PDF.');
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="month"
          defaultValue={period}
          onChange={(e) => changePeriod(e.target.value)}
          className="border border-brand-cream-dark rounded-sm px-3 py-2 text-sm w-40"
        />
        <Button variant="primary" onClick={generate} disabled={generating}>
          {generating ? 'Generating…' : '⚡ Generate Payroll'}
        </Button>
      </div>
      {status && <div className="text-sm text-brand-brown-light">{status}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-4">
          <div className="text-[11px] uppercase font-bold text-brand-brown-light">Period</div>
          <div className="text-base font-extrabold text-brand-brown-dark">{periodLabel(period)}</div>
        </div>
        <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-4">
          <div className="text-[11px] uppercase font-bold text-brand-brown-light">Staff on Payroll</div>
          <div className="text-base font-extrabold text-brand-brown-dark">{eligibleStaff.length}</div>
        </div>
        <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-4">
          <div className="text-[11px] uppercase font-bold text-brand-brown-light">Total Net Pay</div>
          <div className="text-base font-extrabold text-success-700">{fmtMoney(totalNet)}</div>
        </div>
        <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-4">
          <div className="text-[11px] uppercase font-bold text-brand-brown-light">Paid / Generated</div>
          <div className="text-base font-extrabold text-brand-brown-dark">{paidCount} / {slips.length}</div>
        </div>
      </div>

      {eligibleStaff.length === 0 && (
        <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-9 text-center text-brand-brown-light">
          No staff have a basic salary set yet. Edit a staff member (Staff &amp; Teachers) and set their Basic Salary to include them in payroll.
        </div>
      )}

      {eligibleStaff.length > 0 && (
        <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm overflow-hidden">
          <div className="p-4 border-b border-brand-cream-dark flex justify-between items-center flex-wrap gap-2">
            <Input id="pr-search" placeholder="🔍 Search staff…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Button variant="secondary" onClick={markAllPaid}>
              ✓✓ Mark All as Paid
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-cream text-xs uppercase text-brand-brown-light">
                <tr>
                  <th className="text-left px-4 py-2.5">Staff</th>
                  <th className="text-left px-4 py-2.5">Role</th>
                  <th className="text-left px-4 py-2.5">Gross</th>
                  <th className="text-left px-4 py-2.5">Deductions</th>
                  <th className="text-left px-4 py-2.5">Net Pay</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                  <th className="text-left px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const slip = slipMap[s.id];
                  const pay = slip ? { gross: slip.gross_pay, totalDed: slip.total_deductions, net: slip.net_pay } : computePayLine(s);
                  const status = slip?.status || 'not generated';
                  return (
                    <tr key={s.id} className="border-t border-brand-cream-dark">
                      <td className="px-4 py-2.5 font-medium text-brand-brown-dark">{s.full_name}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-[10px] font-bold uppercase bg-brand-cream px-2 py-0.5 rounded">{(s.role || '—').toUpperCase()}</span>
                      </td>
                      <td className="px-4 py-2.5">{fmtMoney(pay.gross)}</td>
                      <td className="px-4 py-2.5 text-danger-700">{fmtMoney(pay.totalDed)}</td>
                      <td className="px-4 py-2.5 font-bold text-success-700">{fmtMoney(pay.net)}</td>
                      <td className="px-4 py-2.5">
                        {status === 'paid' ? (
                          <span className="text-success-700 font-bold">Paid</span>
                        ) : status === 'generated' ? (
                          <span className="text-warning-700 font-bold">Generated</span>
                        ) : (
                          <span className="text-brand-brown-light">Not generated</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 flex gap-3">
                        {slip && (
                          <button onClick={() => download(slip)} disabled={downloading === slip.id} className="text-info-700 hover:underline">
                            {downloading === slip.id ? 'Preparing…' : 'Download'}
                          </button>
                        )}
                        {slip && slip.status !== 'paid' && (
                          <button onClick={() => markPaid(slip.id)} disabled={marking === slip.id} className="text-brand-brown hover:underline">
                            {marking === slip.id ? 'Marking…' : 'Mark Paid'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
