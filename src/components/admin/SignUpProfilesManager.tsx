import { useState } from 'react';
import Button from '../ui/Button';

interface SignupRequest {
  id: string;
  full_name: string;
  gender: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  role: 'staff' | 'student' | 'parent';
  extra_info: string | null;
  status: string;
  submitted_at: string;
}

interface Props {
  initialPending: SignupRequest[];
  initialApproved: SignupRequest[];
  initialRejected: SignupRequest[];
}

const ROLE_COLOR: Record<string, string> = {
  staff: 'border-l-brand-brown',
  student: 'border-l-info-700',
  parent: 'border-l-success-700',
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

async function callAPI(payload: object) {
  const res = await fetch('/api/admin/signup-profiles/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

export default function SignUpProfilesManager({ initialPending, initialApproved, initialRejected }: Props) {
  const [pending, setPending] = useState(initialPending);
  const [approved, setApproved] = useState(initialApproved);
  const [rejected, setRejected] = useState(initialRejected);
  const [tab, setTab] = useState<0 | 1 | 2>(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [credsModal, setCredsModal] = useState<{ name: string; email: string; password: string; emailSent: boolean; emailError?: string } | null>(null);

  async function approve(r: SignupRequest) {
    setBusyId(r.id);
    try {
      const data = await callAPI({ action: 'approve', id: r.id });
      setPending((prev) => prev.filter((x) => x.id !== r.id));
      setApproved((prev) => [{ ...r, status: 'approved' }, ...prev]);
      // Always show the credentials — the old app only emailed them and
      // showed nothing on screen, so a failed/misconfigured email meant
      // the password was gone for good. Showing it here fixes that.
      setCredsModal({ name: r.full_name, email: data.loginEmail, password: data.password, emailSent: data.emailSent, emailError: data.emailError });
    } catch (e: any) {
      alert(e.message || 'Could not approve this request.');
    } finally {
      setBusyId(null);
    }
  }

  async function reject(r: SignupRequest) {
    if (!confirm('Reject this sign-up request?')) return;
    setBusyId(r.id);
    try {
      await callAPI({ action: 'reject', id: r.id });
      setPending((prev) => prev.filter((x) => x.id !== r.id));
      setRejected((prev) => [{ ...r, status: 'rejected' }, ...prev]);
    } catch (e: any) {
      alert(e.message || 'Could not reject this request.');
    } finally {
      setBusyId(null);
    }
  }

  const lists = [pending, approved, rejected];
  const list = lists[tab];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 bg-brand-cream rounded-xl p-1 w-fit">
        {[`Pending (${pending.length})`, `Approved (${approved.length})`, `Rejected (${rejected.length})`].map((label, i) => (
          <button
            key={label}
            onClick={() => setTab(i as 0 | 1 | 2)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === i ? 'bg-white shadow-sm text-brand-brown-dark' : 'text-brand-brown-light'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 && (
        <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-9 text-center text-brand-brown-light">
          No {['pending', 'approved', 'rejected'][tab]} requests.
        </div>
      )}

      {list.map((r) => (
        <div key={r.id} className={`bg-white rounded-lg shadow-sm p-5 border-l-4 ${ROLE_COLOR[r.role] || 'border-l-brand-cream-dark'}`}>
          <div className="flex justify-between items-start gap-3 flex-wrap">
            <div>
              <div className="font-heading font-bold text-brand-brown-dark">{r.full_name}</div>
              <div className="text-xs text-brand-brown-light mt-1">
                <span className="text-[10px] font-bold uppercase bg-brand-cream px-2 py-0.5 rounded mr-1">{r.role}</span>
                {r.email || '—'} · {r.phone || '—'}
              </div>
              <div className="text-xs text-brand-brown-light mt-1">{r.gender || '—'} · {r.address || '—'}</div>
              {r.extra_info && <div className="text-xs text-brand-brown-light mt-1">Extra: {r.extra_info}</div>}
              <div className="text-[11px] text-brand-brown-light mt-1">Submitted: {fmtDate(r.submitted_at)}</div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {r.status === 'pending' ? (
                <>
                  <Button variant="primary" onClick={() => approve(r)} disabled={busyId === r.id}>
                    {busyId === r.id ? 'Working…' : 'Approve & Create Account'}
                  </Button>
                  <Button variant="secondary" onClick={() => reject(r)} disabled={busyId === r.id} className="text-danger-700 border-danger-700 hover:bg-danger-700/10">
                    Reject
                  </Button>
                </>
              ) : (
                <span className={`text-xs font-bold uppercase ${r.status === 'approved' ? 'text-success-700' : 'text-danger-700'}`}>{r.status}</span>
              )}
            </div>
          </div>
        </div>
      ))}

      {credsModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <div className="font-heading font-bold text-brand-brown-dark mb-1">Account Created</div>
            <p className="text-sm text-brand-brown-light mb-4">{credsModal.name}'s login:</p>
            <div className="bg-brand-cream rounded-md p-3 text-sm font-mono mb-2">{credsModal.email}</div>
            <div className="bg-brand-cream rounded-md p-3 text-sm font-mono mb-4">{credsModal.password}</div>
            {credsModal.emailSent ? (
              <p className="text-xs text-success-700 mb-4">✓ Login details emailed to {credsModal.email}.</p>
            ) : (
              <p className="text-xs text-warning-700 mb-4">
                Email not sent{credsModal.emailError ? ` (${credsModal.emailError})` : ''} — please share these credentials with the user directly.
              </p>
            )}
            <Button variant="primary" onClick={() => setCredsModal(null)} className="w-full justify-center">
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
