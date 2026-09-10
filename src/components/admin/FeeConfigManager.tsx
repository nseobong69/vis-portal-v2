import { useState } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';

interface FeeConfig {
  id: string;
  fee_name: string;
  amount: number;
  session: string | null;
  term: string;
  scope: string;
  class_labels: string[];
}
interface ClassOption { id: string; name: string; arm: string | null }

interface Props {
  configs: FeeConfig[];
  classes: ClassOption[];
}

const SESSIONS = ['2024/2025', '2025/2026', '2026/2027', '2027/2028'];
const TERMS = ['1st Term', '2nd Term', '3rd Term'];

export default function FeeConfigManager({ configs, classes }: Props) {
  const [list, setList] = useState(configs);
  const [feeName, setFeeName] = useState('');
  const [amount, setAmount] = useState('');
  const [term, setTerm] = useState(TERMS[0]);
  const [session, setSession] = useState(SESSIONS[SESSIONS.length - 1]);
  const [scope, setScope] = useState<'all' | 'class'>('all');
  const [classIds, setClassIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function toggleClass(id: string) {
    setClassIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  async function handleAdd() {
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/admin/fees/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', feeName, amount: Number(amount), term, session, scope, classIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed.');
      const classById = new Map(classes.map((c) => [c.id, `${c.name}${c.arm ? ' ' + c.arm : ''}`]));
      const class_labels = scope === 'class' && classIds.length ? classIds.map((id) => classById.get(id) || 'Unknown class') : ['All classes'];
      setList((prev) => [{ ...data.config, class_labels }, ...prev]);
      setFeeName('');
      setAmount('');
      setClassIds([]);
      setScope('all');
    } catch (e: any) {
      setError(e.message || 'Could not save fee.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this fee configuration?')) return;
    try {
      const res = await fetch('/api/admin/fees/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed.');
      setList((prev) => prev.filter((f) => f.id !== id));
    } catch (e: any) {
      alert(e.message || 'Could not delete.');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-5 flex flex-col gap-3">
        <div className="font-heading font-bold text-brand-brown-dark">Add Fee</div>
        <div className="grid grid-cols-2 gap-3">
          <Input id="fee-name" label="Fee Name" value={feeName} onChange={(e) => setFeeName(e.target.value)} placeholder="e.g. Tuition, PTA Levy" />
          <Input id="fee-amount" label="Amount (₦)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 39000" />
          <Select id="fee-term" label="Term" options={TERMS.map((t) => ({ value: t, label: t }))} value={term} onChange={(e) => setTerm(e.target.value)} />
          <Select id="fee-session" label="Session" options={SESSIONS.map((s) => ({ value: s, label: s }))} value={session} onChange={(e) => setSession(e.target.value)} />
        </div>

        <Select
          id="fee-scope"
          label="Applies To"
          options={[
            { value: 'all', label: 'All Classes' },
            { value: 'class', label: 'Specific Classes' },
          ]}
          value={scope}
          onChange={(e) => setScope(e.target.value as any)}
        />

        {scope === 'class' && (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-brand-brown-dark">Select Classes</span>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto border border-brand-cream-dark rounded-sm p-2">
              {classes.map((c) => {
                const label = `${c.name}${c.arm ? ' ' + c.arm : ''}`;
                const checked = classIds.includes(c.id);
                return (
                  <label
                    key={c.id}
                    className={`text-xs px-2 py-1 rounded-full border cursor-pointer ${checked ? 'bg-brand-gold/20 border-brand-gold text-brand-brown-dark font-semibold' : 'border-brand-cream-dark text-brand-brown-light'}`}
                  >
                    <input type="checkbox" className="hidden" checked={checked} onChange={() => toggleClass(c.id)} />
                    {label}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {error && <div className="text-sm text-danger-700">{error}</div>}
        <Button variant="primary" onClick={handleAdd} disabled={saving} className="self-start">
          {saving ? 'Saving…' : 'Add Fee'}
        </Button>
      </div>

      <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-brand-cream text-xs uppercase text-brand-brown-light">
            <tr>
              <th className="text-left px-4 py-2.5">Fee</th>
              <th className="text-left px-4 py-2.5">Class(es)</th>
              <th className="text-left px-4 py-2.5">Term / Session</th>
              <th className="text-left px-4 py-2.5">Amount</th>
              <th className="text-left px-4 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center px-4 py-8 text-brand-brown-light">
                  No fees configured yet.
                </td>
              </tr>
            )}
            {list.map((f) => (
              <tr key={f.id} className="border-t border-brand-cream-dark">
                <td className="px-4 py-2.5 font-medium text-brand-brown-dark">{f.fee_name}</td>
                <td className="px-4 py-2.5">{f.class_labels.join(', ')}</td>
                <td className="px-4 py-2.5">{f.term}{f.session ? ` · ${f.session}` : ''}</td>
                <td className="px-4 py-2.5">₦{Number(f.amount).toLocaleString()}</td>
                <td className="px-4 py-2.5">
                  <button onClick={() => handleDelete(f.id)} className="text-danger-700 hover:underline">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
