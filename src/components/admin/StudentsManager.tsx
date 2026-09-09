import { useMemo, useState } from 'react';
import StudentFormModal from './StudentFormModal';
import Button from '../ui/Button';

interface ClassOption { id: string; label: string }

interface StudentRow {
  id: string;
  admission_number: string | null;
  full_name: string;
  surname?: string;
  first_name?: string;
  other_names?: string;
  email?: string;
  class_id: string | null;
  class_name: string | null;
  gender: string | null;
  student_type: string | null;
  date_of_birth?: string;
  address?: string;
  parent_name: string | null;
  parent_phone?: string;
  parent_address?: string;
  has_account: boolean;
  blocked: boolean;
  scholarship: boolean;
}

interface Props {
  students: StudentRow[];
  classes: ClassOption[];
  canAdd: boolean;
  canDelete: boolean;
  initialClassFilter?: string;
}

export default function StudentsManager({ students, classes, canAdd, canDelete, initialClassFilter }: Props) {
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState(initialClassFilter || '');
  const [modalStudent, setModalStudent] = useState<StudentRow | null | undefined>(undefined); // undefined = closed

  const filtered = useMemo(() => {
    return students.filter((s) => {
      if (classFilter && s.class_id !== classFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!s.full_name?.toLowerCase().includes(q) && !s.admission_number?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [students, search, classFilter]);

  async function toggleBlock(s: StudentRow) {
    await fetch('/api/admin/students/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle_block', id: s.id, blocked: !s.blocked }),
    });
    window.location.reload();
  }

  async function del(s: StudentRow) {
    if (!confirm(`Delete ${s.full_name}? This cannot be undone.`)) return;
    const res = await fetch('/api/admin/students/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id: s.id }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data?.error || 'Delete failed.'); return; }
    window.location.reload();
  }

  return (
    <div className="bg-white rounded-lg border border-brand-cream-dark overflow-hidden">
      <div className="p-4 border-b border-brand-cream-dark flex items-center gap-3 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Search students…"
          className="font-body text-sm rounded-sm border border-brand-cream-dark px-3 py-2 max-w-[230px]"
        />
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="font-body text-sm rounded-sm border border-brand-cream-dark px-3 py-2 max-w-[180px]"
        >
          <option value="">All Classes</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <span className="text-xs text-brand-brown-light">{filtered.length} students</span>
        {canAdd && (
          <Button type="button" variant="gold" className="ml-auto" onClick={() => setModalStudent(null)}>
            + Add Student
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-brand-brown-light border-b border-brand-cream-dark">
              <th className="px-4 py-2">Adm No</th>
              <th className="px-4 py-2">Full Name</th>
              <th className="px-4 py-2">Class</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Gender</th>
              <th className="px-4 py-2">Parent</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="text-center py-8 text-brand-brown-light">No students found.</td></tr>
            )}
            {filtered.map((s) => (
              <tr key={s.id} className="border-b border-brand-cream-dark last:border-0">
                <td className="px-4 py-2 font-semibold">{s.admission_number || <span className="text-xs text-brand-brown-light">No Account</span>}</td>
                <td className="px-4 py-2 font-semibold">
                  {s.full_name}{' '}
                  {s.scholarship && <span className="text-[10px] rounded-full px-1.5 py-0.5 bg-violet-100 text-violet-700">★ Scholar</span>}
                </td>
                <td className="px-4 py-2">{s.class_name || '—'}</td>
                <td className="px-4 py-2">
                  <span className={`text-[10.5px] rounded-full px-1.5 py-0.5 ${s.student_type === 'old' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {s.student_type === 'old' ? '↩ Old' : '✦ New'}
                  </span>
                </td>
                <td className="px-4 py-2">{s.gender || '—'}</td>
                <td className="px-4 py-2 text-brand-brown-light">{s.parent_name || '—'}</td>
                <td className="px-4 py-2">
                  {s.blocked
                    ? <span className="text-[10.5px] rounded-full px-1.5 py-0.5 bg-danger-700/10 text-danger-700">🔒 Blocked</span>
                    : s.has_account
                    ? <span className="text-[10.5px] rounded-full px-1.5 py-0.5 bg-success-700/10 text-success-700">✓ Active</span>
                    : <span className="text-[10.5px] rounded-full px-1.5 py-0.5 bg-amber-100 text-amber-700">⏳ Pending</span>}
                </td>
                <td className="px-4 py-2">
                  <div className="flex gap-1.5">
                    <button onClick={() => setModalStudent(s)} className="text-xs px-2 py-1 rounded-sm border border-brand-cream-dark hover:bg-brand-cream" title="Edit">✏️</button>
                    <button onClick={() => toggleBlock(s)} className={`text-xs px-2 py-1 rounded-sm ${s.blocked ? 'bg-success-700 text-white' : 'bg-danger-700 text-white'}`} title={s.blocked ? 'Unblock' : 'Block'}>
                      {s.blocked ? '🔓' : '🔒'}
                    </button>
                    {canDelete && (
                      <button onClick={() => del(s)} className="text-xs px-2 py-1 rounded-sm bg-danger-700 text-white" title="Delete">🗑️</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalStudent !== undefined && (
        <StudentFormModal
          classes={classes}
          student={modalStudent}
          onClose={() => setModalStudent(undefined)}
          onSaved={() => window.location.reload()}
        />
      )}
    </div>
  );
}
