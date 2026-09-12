import { useState } from 'react';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import InternalAdmissionModal from './InternalAdmissionModal';

interface Admission {
  id: string;
  full_name: string;
  class_applied: string | null;
  class_admitted?: string | null;
  created_at: string;
  aptitude_score: number | null;
  admission_fee: number | null;
  amount_paid?: number | null;
  payment_method?: string | null;
  payment_status: string | null;
  status: string | null;
  pub_payment_confirmed: boolean | null;
  gender?: string | null;
  date_of_birth?: string | null;
  nationality?: string | null;
  state_of_origin?: string | null;
  religion?: string | null;
  parent_name?: string | null;
  phone?: string | null;
  email?: string | null;
}
interface ClassOption { id: string; name: string; arm: string | null }

async function callAPI(payload: object) {
  const res = await fetch('/api/admin/admissions/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function isIncomplete(a: Admission) {
  return a.payment_status === 'pending_confirmation' || (a.payment_status !== 'paid' && a.payment_status !== 'partial' && !a.pub_payment_confirmed);
}

function payBadge(status: string) {
  const map: Record<string, string> = {
    paid: 'bg-success-700/10 text-success-700',
    partial: 'bg-warning-700/10 text-warning-700',
    unpaid: 'bg-danger-700/10 text-danger-700',
    pending_confirmation: 'bg-warning-700/10 text-warning-700',
  };
  const label = status === 'pending_confirmation' ? 'Pending Confirm' : status.charAt(0).toUpperCase() + status.slice(1);
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${map[status] || 'bg-brand-cream text-brand-brown-light'}`}>{label}</span>;
}

function StatCard({ icon, label, value, color, bg }: { icon: string; label: string; value: number; color: string; bg: string }) {
  return (
    <div className="rounded-lg border p-4 flex items-center gap-3" style={{ borderColor: color + '40' }}>
      <div className="w-10 h-10 rounded-md flex items-center justify-center text-lg" style={{ background: bg }}>{icon}</div>
      <div>
        <div className="text-2xl font-bold" style={{ color }}>{value}</div>
        <div className="text-xs text-brand-brown-light">{label}</div>
      </div>
    </div>
  );
}

/** Ports confirmAdmPayment()/saveAdmPaymentConfirmation() (index.html
 * ~21809-21901) — a real amount+method modal, not a status flip. */
function ConfirmPaymentModal({ admission, onClose, onSaved }: { admission: Admission; onClose: () => void; onSaved: (status: string) => void }) {
  const [amount, setAmount] = useState(String(admission.admission_fee || 0));
  const [method, setMethod] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const balance = Math.max(0, (Number(admission.admission_fee) || 0) - (Number(amount) || 0));

  async function submit() {
    if (!method) {
      setError('Select a payment method.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const data = await callAPI({ action: 'confirmPayment', id: admission.id, amountPaid: Number(amount) || 0, paymentMethod: method });
      onSaved(data.status);
    } catch (e: any) {
      setError(e.message || 'Could not confirm payment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="💳 Confirm Payment">
      <div className="flex flex-col gap-3 min-w-[280px]">
        <div className="bg-brand-cream rounded-lg p-3 text-sm">
          <div className="font-bold text-brand-brown-dark">{admission.full_name}</div>
          <div className="text-brand-brown-light">Class: {admission.class_applied || '—'} · Admission Fee: <strong>₦{(admission.admission_fee || 0).toLocaleString()}</strong></div>
        </div>
        <Input id="pay-amount" label="Amount Collected (₦)" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
        <div className="text-xs font-semibold text-warning-700">Balance: ₦{balance.toLocaleString()}</div>
        <div>
          <label className="text-sm font-medium text-brand-brown-dark block mb-1">Payment Method</label>
          <select className="w-full rounded border border-brand-cream-dark px-3 py-2 text-sm" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">Select</option>
            <option value="cash">Cash</option>
            <option value="transfer">Bank Transfer</option>
            <option value="paystack">Paystack/Online</option>
          </select>
        </div>
        {error && <div className="text-sm text-danger-700">{error}</div>}
        <div className="flex gap-2 mt-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={saving} className="flex-1">{saving ? 'Saving…' : '✓ Confirm & Unlock'}</Button>
        </div>
      </div>
    </Modal>
  );
}

/** Ports viewAdmissionDetail() (index.html ~22016-22042). Reads fields
 * already fetched with the initial admissions.astro select('*') — no
 * extra API call needed. */
function DetailModal({ admission, onClose }: { admission: Admission; onClose: () => void }) {
  const rows: [string, string][] = [
    ['Class Applied', admission.class_applied || '—'],
    ['Class Admitted', admission.class_admitted || '—'],
    ['Gender', admission.gender || '—'],
    ['DOB', admission.date_of_birth ? new Date(admission.date_of_birth).toLocaleDateString('en-GB') : '—'],
    ['Nationality', admission.nationality || '—'],
    ['State', admission.state_of_origin || '—'],
    ['Religion', admission.religion || '—'],
    ['Aptitude Score', admission.aptitude_score != null ? admission.aptitude_score + '%' : '—'],
    ['Parent', admission.parent_name || '—'],
    ['Phone', admission.phone || '—'],
    ['Email', admission.email || '—'],
    ['Amount Paid', '₦' + (admission.amount_paid || 0).toLocaleString()],
    ['Payment Method', admission.payment_method || '—'],
    ['Status', admission.status || 'pending'],
  ];
  return (
    <Modal open onClose={onClose} title={`Admission Detail — ${admission.full_name}`}>
      <div className="min-w-[280px] max-w-[560px]">
        <div className="grid grid-cols-2 gap-2.5 text-[13px]">
          {rows.map(([label, value]) => (
            <div key={label}><strong className="text-brand-brown-dark">{label}:</strong> <span className="text-brand-brown-light">{value}</span></div>
          ))}
        </div>
        <div className="flex gap-2 mt-5">
          <button disabled title="Not built yet — see admissions.astro header comment" className="flex-1 text-sm font-semibold px-4 py-2 rounded-md bg-brand-cream text-brand-brown-light cursor-not-allowed">📄 Download Admission Letter</button>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}

/** Ports showAdmFeeSettingsModal()/saveAdmFeeSettings(). UNVERIFIED: the
 * three school_settings columns this writes to (admission_fee_configs,
 * admission_fee_sections — admission_fee_default IS confirmed, already
 * used successfully in settings.astro) have not been checked against
 * the real schema. Run the same information_schema.columns query used
 * for `admissions`/`fee_receipts` against `school_settings` before
 * fully trusting this modal. */
function FeeSettingsModal({ initialDefault, initialSections, onClose, onSaved }: { initialDefault: number; initialSections: Record<string, number>; onClose: () => void; onSaved: () => void }) {
  const SECTIONS = ['Kindergarten', 'Nursery', 'Primary', 'Secondary'];
  const [def, setDef] = useState(String(initialDefault || 0));
  const [sections, setSections] = useState<Record<string, string>>(
    Object.fromEntries(SECTIONS.map((s) => [s, String(initialSections?.[s.toLowerCase()] ?? initialDefault ?? 0)]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function applyDefaultToAll() {
    setSections(Object.fromEntries(SECTIONS.map((s) => [s, def])));
  }

  async function submit() {
    setSaving(true);
    setError('');
    try {
      const feeSections: Record<string, number> = {};
      SECTIONS.forEach((s) => { feeSections[s.toLowerCase()] = Number(sections[s]) || 0; });
      await callAPI({ action: 'saveFeeSettings', admissionFeeDefault: Number(def) || 0, feeSections });
      onSaved();
    } catch (e: any) {
      setError(e.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="💳 Admission Fee Settings">
      <div className="flex flex-col gap-4 min-w-[280px] max-w-[420px]">
        <Input id="fee-default" label="Default Admission Fee (₦)" type="number" min={0} value={def} onChange={(e) => setDef(e.target.value)} />
        <Button variant="secondary" onClick={applyDefaultToAll} className="self-start text-xs">Apply Default to All Sections</Button>
        <div className="flex flex-col gap-2.5">
          {SECTIONS.map((s) => (
            <div key={s} className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-brand-brown-dark">{s}</label>
              <input
                type="number" min={0} className="w-32 rounded border border-brand-cream-dark px-2 py-1.5 text-sm"
                value={sections[s]} onChange={(e) => setSections((prev) => ({ ...prev, [s]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        {error && <div className="text-sm text-danger-700">{error}</div>}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={saving} className="flex-1">{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </Modal>
  );
}

/** Ports showAdmCBTSettingsModal()/setAllCBT()/saveAdmCBTSettings()
 * (index.html ~21783-21807). Same schema caveat as FeeSettingsModal —
 * admission_cbt_configs is unverified. */
function CbtSettingsModal({ classes, initialConfigs, onClose, onSaved }: { classes: ClassOption[]; initialConfigs: Record<string, any>; onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState(() =>
    classes.map((c) => {
      const label = `${c.name}${c.arm ? ' ' + c.arm : ''}`;
      const key = label.toLowerCase();
      const existing = initialConfigs?.[key];
      return { key, label, required: existing?.required ?? false, examTitle: existing?.exam_title || `${label} Entrance Test` };
    })
  );
  const [saving, setSaving] = useState(false);

  function toggle(key: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, required: !r.required } : r)));
  }
  function setAll(enabled: boolean) {
    setRows((prev) => prev.map((r) => ({ ...r, required: enabled })));
  }
  function setTitle(key: string, title: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, examTitle: title } : r)));
  }

  async function submit() {
    setSaving(true);
    try {
      const cbtConfigs: Record<string, any> = {};
      rows.forEach((r) => {
        cbtConfigs[r.key] = r.required ? { required: true, class_name: r.label, exam_title: r.examTitle.trim() || `${r.label} Entrance Test` } : { required: false };
      });
      await callAPI({ action: 'saveCbtSettings', cbtConfigs });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="💻 Aptitude Test Settings">
      <div className="flex flex-col gap-3 min-w-[280px] max-w-[480px]">
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setAll(true)} className="text-xs">Enable All</Button>
          <Button variant="secondary" onClick={() => setAll(false)} className="text-xs">Disable All</Button>
        </div>
        <div className="max-h-72 overflow-y-auto flex flex-col gap-2">
          {rows.map((r) => (
            <div key={r.key} className="border border-brand-cream-dark rounded-md p-2.5">
              <label className="flex items-center gap-2 text-sm font-semibold text-brand-brown-dark cursor-pointer">
                <input type="checkbox" checked={r.required} onChange={() => toggle(r.key)} />
                {r.label}
              </label>
              {r.required && (
                <input
                  className="mt-2 w-full rounded border border-brand-cream-dark px-2 py-1.5 text-xs"
                  value={r.examTitle} onChange={(e) => setTitle(r.key, e.target.value)} placeholder="Exam title"
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={saving} className="flex-1">{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function AdmissionsManager({
  admissions, classes, role, publicFormUrl, initialFeeDefault, initialFeeSections, initialFeeConfigs, initialCbtConfigs,
}: {
  admissions: Admission[]; classes: ClassOption[]; role: string; publicFormUrl: string;
  initialFeeDefault: number; initialFeeSections: Record<string, number>; initialFeeConfigs: Record<string, number>; initialCbtConfigs: Record<string, any>;
}) {
  const [list, setList] = useState(admissions);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [payingFor, setPayingFor] = useState<Admission | null>(null);
  const [viewingFor, setViewingFor] = useState<Admission | null>(null);
  const [feeModalOpen, setFeeModalOpen] = useState(false);
  const [cbtModalOpen, setCbtModalOpen] = useState(false);
  const [newAdmOpen, setNewAdmOpen] = useState(false);

  const incomplete = list.filter(isIncomplete);
  const stats = {
    total: list.length,
    paid: list.filter((a) => a.payment_status === 'paid').length,
    approved: list.filter((a) => a.status === 'approved').length,
    pending: list.filter((a) => a.status === 'pending' || !a.status).length,
    incomplete: incomplete.length,
  };

  async function act(a: Admission, action: 'approve' | 'reject' | 'delete') {
    if (action === 'delete' && !confirm(`Permanently delete the admission application for ${a.full_name}? This cannot be undone.`)) return;
    setBusyId(a.id);
    setError('');
    try {
      const data = await callAPI({ action, id: a.id });
      if (action === 'delete') {
        setList((prev) => prev.filter((x) => x.id !== a.id));
      } else if (action === 'approve') {
        setList((prev) => prev.map((x) => (x.id !== a.id ? x : { ...x, status: 'approved', class_admitted: data.assignedClassName })));
      } else {
        setList((prev) => prev.map((x) => (x.id !== a.id ? x : { ...x, status: 'rejected' })));
      }
    } catch (e: any) {
      setError(e.message || 'Action failed.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <a href={publicFormUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold px-3 py-2 rounded-md border border-brand-cream-dark hover:bg-brand-cream">🔗 Public Form</a>
        <button onClick={() => setNewAdmOpen(true)} className="text-sm font-semibold px-3 py-2 rounded-md bg-brand-brown-dark text-white hover:brightness-110">+ New Admission</button>
        {role === 'super_admin' && (
          <button onClick={() => setFeeModalOpen(true)} className="text-sm font-semibold px-3 py-2 rounded-md border border-brand-cream-dark hover:bg-brand-cream">💳 Admission Fees</button>
        )}
        {role === 'super_admin' && (
          <button onClick={() => setCbtModalOpen(true)} className="text-sm font-semibold px-3 py-2 rounded-md border border-brand-gold text-brand-gold-dark hover:bg-brand-cream">💻 Aptitude Test</button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon="📄" label="Total" value={stats.total} color="#5D4037" bg="#F5EDE3" />
        <StatCard icon="💳" label="Paid" value={stats.paid} color="#16A34A" bg="#DCFCE7" />
        <StatCard icon="✅" label="Approved" value={stats.approved} color="#2563EB" bg="#DBEAFE" />
        <StatCard icon="⏱️" label="Pending" value={stats.pending} color="#D97706" bg="#FEF3C7" />
        <StatCard icon="⚠️" label="Incomplete" value={stats.incomplete} color="#EF4444" bg="#FEE2E2" />
      </div>

      {error && <div className="text-sm text-danger-700">{error}</div>}

      <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead className="bg-brand-cream text-xs uppercase text-brand-brown-light">
            <tr>
              <th className="text-left px-4 py-2.5">Applicant</th>
              <th className="text-left px-4 py-2.5">Class Applied</th>
              <th className="text-left px-4 py-2.5">Date</th>
              <th className="text-left px-4 py-2.5">Aptitude</th>
              <th className="text-left px-4 py-2.5">Adm Fee</th>
              <th className="text-left px-4 py-2.5">Payment</th>
              <th className="text-left px-4 py-2.5">Status</th>
              <th className="text-left px-4 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={8} className="text-center px-4 py-8 text-brand-brown-light">No applications yet.</td></tr>
            )}
            {list.map((a) => {
              const inc = isIncomplete(a);
              const busy = busyId === a.id;
              return (
                <tr key={a.id} className={`border-t border-brand-cream-dark ${inc ? 'bg-danger-700/5' : ''}`}>
                  <td className="px-4 py-2.5 font-semibold text-brand-brown-dark">
                    <button onClick={() => setViewingFor(a)} className="hover:underline text-left">{a.full_name}</button>
                    {inc && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-danger-700/10 text-danger-700">Incomplete</span>}
                  </td>
                  <td className="px-4 py-2.5">{a.class_applied || '—'}</td>
                  <td className="px-4 py-2.5 text-brand-brown-light">{new Date(a.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td className="px-4 py-2.5">
                    {a.aptitude_score != null
                      ? <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${a.aptitude_score >= 65 ? 'bg-success-700/10 text-success-700' : 'bg-danger-700/10 text-danger-700'}`}>{a.aptitude_score}%</span>
                      : '—'}
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-brand-brown-dark">₦{(a.admission_fee || 0).toLocaleString()}</td>
                  <td className="px-4 py-2.5">{payBadge(a.payment_status || 'unpaid')}</td>
                  <td className="px-4 py-2.5">
                    {a.status === 'approved' ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-success-700/10 text-success-700">Approved</span>
                      : a.status === 'rejected' ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-danger-700/10 text-danger-700">Rejected</span>
                      : <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-warning-700/10 text-warning-700">Pending</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1.5 flex-wrap">
                      {inc && (
                        <button disabled={busy} onClick={() => setPayingFor(a)} className="text-[11px] font-semibold px-2 py-1 rounded-md bg-warning-700/10 text-warning-700 border border-warning-700/40">
                          💳 Confirm Payment
                        </button>
                      )}
                      <button disabled={busy} onClick={() => act(a, 'approve')} className="text-[11px] font-semibold px-2 py-1 rounded-md bg-success-700/10 text-success-700">✓ Approve</button>
                      <button disabled={busy} onClick={() => act(a, 'reject')} className="text-[11px] font-semibold px-2 py-1 rounded-md bg-danger-700/10 text-danger-700">✕ Reject</button>
                      {role === 'super_admin' && (
                        <button disabled={busy} onClick={() => act(a, 'delete')} className="text-[11px] font-semibold px-2 py-1 rounded-md bg-danger-700 text-white" title="Delete (Super Admin only)">🗑️</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {payingFor && (
        <ConfirmPaymentModal
          admission={payingFor}
          onClose={() => setPayingFor(null)}
          onSaved={(status) => {
            setList((prev) => prev.map((x) => (x.id === payingFor.id ? { ...x, payment_status: status, status: 'pending' } : x)));
            setPayingFor(null);
          }}
        />
      )}
      {viewingFor && <DetailModal admission={viewingFor} onClose={() => setViewingFor(null)} />}
      {feeModalOpen && (
        <FeeSettingsModal
          initialDefault={initialFeeDefault}
          initialSections={initialFeeSections}
          onClose={() => setFeeModalOpen(false)}
          onSaved={() => setFeeModalOpen(false)}
        />
      )}
      {cbtModalOpen && (
        <CbtSettingsModal
          classes={classes}
          initialConfigs={initialCbtConfigs}
          onClose={() => setCbtModalOpen(false)}
          onSaved={() => setCbtModalOpen(false)}
        />
      )}
      {newAdmOpen && (
        <InternalAdmissionModal
          classes={classes}
          feeDefault={initialFeeDefault}
          feeSections={initialFeeSections}
          feeConfigs={initialFeeConfigs}
          onClose={() => setNewAdmOpen(false)}
          onCreated={() => window.location.reload()}
        />
      )}
    </div>
  );
}
