import { useState } from 'react';

const ROLES = ['teacher', 'head_teacher', 'principal', 'admin', 'proprietor', 'parent', 'student'];

export default function AccountCreateForm() {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState(ROLES[0]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch('/api/admin/accounts/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, full_name: fullName, role }),
      });
      const json = await res.json();
      if (res.status === 207) {
        setStatus(`Partial: ${json.warning}`);
      } else if (!res.ok) {
        setStatus(`Error: ${json.error}`);
      } else {
        setStatus('Account created — confirmation email sent.');
        setEmail(''); setFullName('');
      }
    } catch {
      setStatus('Network error — could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 max-w-md">
      <label className="flex flex-col text-xs text-brand-brown-dark">
        <span className="font-heading font-semibold mb-1">Full Name</span>
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="border border-brand-cream-dark rounded px-2 py-1.5 text-sm"
          required
        />
      </label>
      <label className="flex flex-col text-xs text-brand-brown-dark">
        <span className="font-heading font-semibold mb-1">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border border-brand-cream-dark rounded px-2 py-1.5 text-sm"
          required
        />
      </label>
      <label className="flex flex-col text-xs text-brand-brown-dark">
        <span className="font-heading font-semibold mb-1">Role</span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="border border-brand-cream-dark rounded px-2 py-1.5 text-sm"
        >
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="px-3 py-1.5 text-xs font-heading font-semibold rounded bg-brand-gold text-brand-brown-dark disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create Account'}
        </button>
        {status && <span className="text-xs text-brand-brown-dark">{status}</span>}
      </div>
    </form>
  );
}
