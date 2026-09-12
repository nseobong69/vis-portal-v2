import { useState } from 'react';
import Select from '../ui/Select';
import Button from '../ui/Button';
import { fmtStuName } from '../../lib/fixNameOrder';

interface ClassOption { id: string; name: string; arm: string | null }
interface ScholarshipStudent {
  id: string; full_name: string; admission_number: string | null;
  class_name: string | null; created_at?: string; class_join_year?: number | null;
}

async function callAPI(payload: object) {
  const res = await fetch('/api/admin/scholarship/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

export default function ScholarshipManager({ classes }: { classes: ClassOption[] }) {
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState<ScholarshipStudent[] | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await callAPI({ action: 'list', classId });
      setStudents(data.students || []);
    } catch (e: any) {
      setError(e.message || 'Could not load scholarship students.');
    } finally {
      setLoading(false);
    }
  }

  async function remove(s: ScholarshipStudent) {
    if (!confirm(`Remove scholarship from ${s.full_name}?`)) return;
    try {
      await callAPI({ action: 'remove', studentId: s.id });
      setStudents((prev) => (prev || []).filter((x) => x.id !== s.id));
    } catch (e: any) {
      alert(e.message || 'Could not remove scholarship.');
    }
  }

  const filtered = (students || []).filter(
    (s) => !search || (s.full_name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-4 flex items-center gap-3 flex-wrap">
        <Select
          id="sc-class" value={classId} onChange={(e) => setClassId(e.target.value)}
          placeholder="All Classes"
          options={classes.map((c) => ({ value: c.id, label: `${c.name}${c.arm ? ' ' + c.arm : ''}` }))}
        />
        <Button variant="primary" onClick={load} disabled={loading}>🔍 View All</Button>
      </div>

      {error && <div className="text-sm text-danger-700">{error}</div>}

      {students !== null && (
        <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-brand-cream-dark flex items-center justify-between flex-wrap gap-2">
            <span className="font-bold text-brand-brown-dark text-sm">
              🏆 {students.length} Scholarship Student{students.length !== 1 ? 's' : ''}
            </span>
            <input
              className="max-w-[220px] rounded border border-brand-cream-dark px-3 py-1.5 text-sm"
              placeholder="🔍 Search…" value={search} onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[580px]">
              <thead className="bg-brand-cream text-xs uppercase text-brand-brown-light">
                <tr>
                  <th className="text-left px-4 py-2.5">Name</th>
                  <th className="text-left px-4 py-2.5">Adm No</th>
                  <th className="text-left px-4 py-2.5">Class</th>
                  <th className="text-left px-4 py-2.5">Year Added</th>
                  <th className="text-left px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="text-center px-4 py-8 text-brand-brown-light">🏆 No scholarship students found.</td></tr>
                )}
                {filtered.map((s) => (
                  <tr key={s.id} className="border-t border-brand-cream-dark">
                    <td className="px-4 py-2.5 font-bold text-brand-brown-dark">🏆 {fmtStuName(s.full_name)}</td>
                    <td className="px-4 py-2.5 text-brand-brown-light">{s.admission_number || '—'}</td>
                    <td className="px-4 py-2.5"><span className="text-xs bg-brand-cream px-2 py-0.5 rounded-full">{s.class_name || '—'}</span></td>
                    <td className="px-4 py-2.5 text-brand-brown-light">{s.class_join_year || new Date(s.created_at || Date.now()).getFullYear()}</td>
                    <td className="px-4 py-2.5 flex gap-2">
                      <button onClick={() => remove(s)} className="text-xs font-semibold px-2.5 py-1 rounded-md bg-danger-700/10 text-danger-700">✕ Remove</button>
                      <a href={`/admin/students?search=${encodeURIComponent(s.full_name)}`} className="text-xs font-semibold px-2.5 py-1 rounded-md text-brand-brown-dark hover:bg-brand-cream" title="Edit">✏️</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
