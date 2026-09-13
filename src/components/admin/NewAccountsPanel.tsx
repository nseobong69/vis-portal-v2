import { useEffect, useState } from 'react';
import Button from '../ui/Button';

interface ClassOption { id: string; name: string; arm: string | null; level?: string }
interface StudentRow { id: string; full_name: string; gender?: string; class_name?: string }
interface StaffRow { id: string; full_name: string; role?: string; roles?: string[] }

interface Props {
  initialType: 'students' | 'staff';
  classes: ClassOption[];
  canManageStaff: boolean;
}

// Same alphabet convention as the rest of this app's secure generators
// (Result PINs/Aptitude Codes) — real crypto.getRandomValues, not
// Math.random().
const PASS_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
function securePass(len = 8): string {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => PASS_ALPHABET[n % PASS_ALPHABET.length]).join('');
}
function genAdmNum(): string {
  const buf = new Uint32Array(5);
  crypto.getRandomValues(buf);
  const alpha = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const suffix = Array.from(buf, (n) => alpha[n % alpha.length]).join('');
  return `VIS/${new Date().getFullYear()}/${suffix}`;
}
function roleLabel(r?: string): string {
  const rn = (r || '').replace(/_/g, ' ');
  return rn === 'proprietor' ? 'School Director' : rn.charAt(0).toUpperCase() + rn.slice(1);
}
function fmtStuName(full?: string): string {
  const f = (full || '').trim();
  const sp = f.indexOf(' ');
  return sp < 0 ? f : f.slice(0, sp) + ', ' + f.slice(sp + 1);
}

export default function NewAccountsPanel({ initialType, classes, canManageStaff }: Props) {
  const [tab, setTab] = useState<'students' | 'staff'>(initialType === 'staff' && canManageStaff ? 'staff' : 'students');

  const [section, setSection] = useState('');
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [studentCreds, setStudentCreds] = useState<Record<string, { adm: string; pass: string }>>({});
  const [studentChecked, setStudentChecked] = useState<Set<string>>(new Set());
  const [loadingStudents, setLoadingStudents] = useState(false);

  const [staff, setStaff] = useState<StaffRow[] | null>(null);
  const [staffCreds, setStaffCreds] = useState<Record<string, { email: string; pass: string }>>({});
  const [staffChecked, setStaffChecked] = useState<Set<string>>(new Set());
  const [loadingStaff, setLoadingStaff] = useState(true);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const sections = ['Kindergarten', 'Nursery', 'Primary', 'Secondary'];
  const filteredClasses = section ? classes.filter((c) => (c.level || '').toLowerCase() === section) : classes;

  useEffect(() => {
    if (tab === 'staff' && staff === null) loadStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function loadStaff() {
    setLoadingStaff(true);
    const res = await fetch('/api/admin/accounts/without?type=staff');
    const data = await res.json();
    setStaff(res.ok ? data.staff : []);
    setLoadingStaff(false);
  }

  async function loadStudents(cid: string) {
    setClassId(cid);
    setStudents(null);
    setStudentCreds({});
    setStudentChecked(new Set());
    if (!cid) return;
    setLoadingStudents(true);
    const res = await fetch(`/api/admin/accounts/without?class_id=${cid}`);
    const data = await res.json();
    setStudents(res.ok ? data.students : []);
    setLoadingStudents(false);
  }

  function toggleStudent(id: string) {
    setStudentChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleStaff(id: string) {
    setStaffChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function bulkGenStudents() {
    setStudentCreds((prev) => {
      const next = { ...prev };
      studentChecked.forEach((id) => {
        next[id] = { adm: next[id]?.adm || genAdmNum(), pass: next[id]?.pass || securePass() };
      });
      return next;
    });
  }
  function bulkGenStaff() {
    setStaffCreds((prev) => {
      const next = { ...prev };
      staffChecked.forEach((id) => {
        const s = (staff || []).find((s) => s.id === id);
        const slug = (s?.full_name || 'staff').toLowerCase().replace(/\s+/g, '.').replace(/[^a-z.]/g, '').slice(0, 20);
        next[id] = { email: next[id]?.email || `${slug}@vis.edu`, pass: next[id]?.pass || securePass() };
      });
      return next;
    });
  }

  async function saveStudents() {
    // Student passwords are always uppercased before leaving the
    // browser — matches the old app's studentLogin() rule
    // (index.html ~L6052/6062: the login form itself uppercases
    // whatever the student types), and the same rule already applied
    // to saveStudentAccountCreds() there and to this app's login.ts /
    // existing.ts. Staff passwords (saveStaff() below) are
    // deliberately NOT uppercased — staffLogin() never uppercases,
    // since staff choose real passwords of their own.
    const rows = Object.entries(studentCreds)
      .filter(([, v]) => v.adm?.trim() && v.pass?.trim())
      .map(([id, v]) => ({ id, adm: v.adm.trim(), pass: v.pass.trim().toUpperCase() }));
    if (!rows.length) { setError('No credentials to save. Fill in at least one row.'); return; }
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const res = await fetch('/api/admin/accounts/bulk-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'students', students: rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed.');
      setStatus(data.failed ? `⚠️ ${data.saved} saved, ${data.failed} failed.` : `✅ ${data.saved} student account(s) activated and Auth created!`);
      loadStudents(classId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed.');
    } finally {
      setSaving(false);
    }
  }

  async function saveStaff() {
    const rows = Object.entries(staffCreds)
      .filter(([, v]) => v.email?.trim() && v.pass?.trim())
      .map(([id, v]) => ({ id, email: v.email.trim(), pass: v.pass.trim() }));
    if (!rows.length) { setError('No credentials to save.'); return; }
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const res = await fetch('/api/admin/accounts/bulk-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'staff', staff: rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed.');
      setStatus(data.failed ? `⚠️ ${data.saved} saved, ${data.failed} failed.` : `✅ ${data.saved} staff account(s) activated and Auth created!`);
      setStaffCreds({});
      setStaffChecked(new Set());
      loadStaff();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 bg-brand-cream rounded-lg p-1 max-w-fit flex-wrap">
        <button onClick={() => setTab('students')} className={`text-sm px-4 py-2 rounded-md font-medium ${tab === 'students' ? 'bg-brand-gold text-shell-obsidian' : 'text-brand-brown-light'}`}>👥 New Student Accounts</button>
        {canManageStaff && (
          <button onClick={() => setTab('staff')} className={`text-sm px-4 py-2 rounded-md font-medium ${tab === 'staff' ? 'bg-brand-gold text-shell-obsidian' : 'text-brand-brown-light'}`}>🧑‍💼 New Staff Accounts</button>
        )}
      </div>

      {error && <p className="text-sm text-danger-700">{error}</p>}
      {status && <p className="text-sm text-success-700">{status}</p>}

      {tab === 'students' && (
        <div className="bg-white rounded-lg border border-brand-cream-dark p-5 flex flex-col gap-4">
          <div className="flex gap-3 flex-wrap items-end">
            <div className="flex flex-col gap-1 min-w-[160px]">
              <label className="text-xs font-medium text-brand-brown-dark">Section</label>
              <select value={section} onChange={(e) => { setSection(e.target.value); loadStudents(''); }} className="text-sm rounded-sm border border-brand-cream-dark px-3 py-2">
                <option value="">All Sections</option>
                {sections.map((s) => <option key={s} value={s.toLowerCase()}>{s}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1 min-w-[180px]">
              <label className="text-xs font-medium text-brand-brown-dark">Class</label>
              <select value={classId} onChange={(e) => loadStudents(e.target.value)} className="text-sm rounded-sm border border-brand-cream-dark px-3 py-2">
                <option value="">Select Class</option>
                {filteredClasses.map((c) => <option key={c.id} value={c.id}>{c.name}{c.arm ? ' ' + c.arm : ''}</option>)}
              </select>
            </div>
          </div>

          {loadingStudents && <div className="text-center py-8 text-brand-brown-light">Loading…</div>}

          {!loadingStudents && students !== null && (
            students.length === 0 ? (
              <p className="text-brand-brown-light text-sm">All students in this class already have accounts.</p>
            ) : (
              <>
                <p className="bg-brand-cream text-brand-brown-light text-xs rounded-md px-3.5 py-2.5">
                  {students.length} student(s) without accounts. Generate or manually enter credentials below.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setStudentChecked(new Set(students.map((s) => s.id)))} className="text-xs px-2.5 py-1.5 rounded-sm border border-brand-cream-dark hover:bg-brand-cream">✓✓ Select All</button>
                  <button onClick={() => setStudentChecked(new Set())} className="text-xs px-2.5 py-1.5 rounded-sm border border-brand-cream-dark hover:bg-brand-cream">✕ Deselect All</button>
                  <Button type="button" variant="gold" onClick={bulkGenStudents}>✨ Auto-Generate Selected</Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-brand-brown-light border-b border-brand-cream-dark">
                        <th className="px-2 py-2"><input type="checkbox" checked={studentChecked.size === students.length} onChange={(e) => setStudentChecked(e.target.checked ? new Set(students.map((s) => s.id)) : new Set())} /></th>
                        <th className="px-2 py-2">Name</th><th className="px-2 py-2">Gender</th><th className="px-2 py-2">Class</th>
                        <th className="px-2 py-2">Admission No (auto/manual)</th><th className="px-2 py-2">Password (auto/manual)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s) => (
                        <tr key={s.id} className="border-b border-brand-cream-dark last:border-0">
                          <td className="px-2 py-1.5"><input type="checkbox" checked={studentChecked.has(s.id)} onChange={() => toggleStudent(s.id)} /></td>
                          <td className="px-2 py-1.5 font-semibold">{fmtStuName(s.full_name)}</td>
                          <td className="px-2 py-1.5">{s.gender || '—'}</td>
                          <td className="px-2 py-1.5"><span className="text-[10.5px] rounded-full px-1.5 py-0.5 bg-brand-cream">{s.class_name || '—'}</span></td>
                          <td className="px-2 py-1.5">
                            <input value={studentCreds[s.id]?.adm || ''} onChange={(e) => setStudentCreds((prev) => ({ ...prev, [s.id]: { adm: e.target.value, pass: prev[s.id]?.pass || '' } }))} placeholder="Auto-generate or type" className="text-xs rounded-sm border border-brand-cream-dark px-2 py-1 min-w-[140px]" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input value={studentCreds[s.id]?.pass || ''} onChange={(e) => setStudentCreds((prev) => ({ ...prev, [s.id]: { adm: prev[s.id]?.adm || '', pass: e.target.value } }))} placeholder="Auto-generate or type" className="text-xs rounded-sm border border-brand-cream-dark px-2 py-1 min-w-[130px]" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Button type="button" variant="primary" onClick={saveStudents} disabled={saving} className="self-start">
                  {saving ? 'Saving…' : '💾 Save Credentials'}
                </Button>
              </>
            )
          )}
        </div>
      )}

      {tab === 'staff' && canManageStaff && (
        <div className="bg-white rounded-lg border border-brand-cream-dark p-5 flex flex-col gap-4">
          {loadingStaff && <div className="text-center py-8 text-brand-brown-light">Loading…</div>}
          {!loadingStaff && staff !== null && (
            staff.length === 0 ? (
              <p className="text-brand-brown-light text-sm">All staff members already have accounts.</p>
            ) : (
              <>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setStaffChecked(new Set(staff.map((s) => s.id)))} className="text-xs px-2.5 py-1.5 rounded-sm border border-brand-cream-dark hover:bg-brand-cream">✓✓ Select All</button>
                  <button onClick={() => setStaffChecked(new Set())} className="text-xs px-2.5 py-1.5 rounded-sm border border-brand-cream-dark hover:bg-brand-cream">✕ Deselect All</button>
                  <Button type="button" variant="gold" onClick={bulkGenStaff}>✨ Auto-Generate Selected</Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-brand-brown-light border-b border-brand-cream-dark">
                        <th className="px-2 py-2"><input type="checkbox" checked={staffChecked.size === staff.length} onChange={(e) => setStaffChecked(e.target.checked ? new Set(staff.map((s) => s.id)) : new Set())} /></th>
                        <th className="px-2 py-2">Name</th><th className="px-2 py-2">Role</th>
                        <th className="px-2 py-2">Email (auto/manual)</th><th className="px-2 py-2">Password (auto/manual)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staff.map((s) => (
                        <tr key={s.id} className="border-b border-brand-cream-dark last:border-0">
                          <td className="px-2 py-1.5"><input type="checkbox" checked={staffChecked.has(s.id)} onChange={() => toggleStaff(s.id)} /></td>
                          <td className="px-2 py-1.5 font-semibold">{fmtStuName(s.full_name)}</td>
                          <td className="px-2 py-1.5"><span className="text-[10.5px] rounded-full px-1.5 py-0.5 bg-brand-cream uppercase">{roleLabel(s.roles?.length ? s.roles[0] : s.role)}</span></td>
                          <td className="px-2 py-1.5">
                            <input type="email" value={staffCreds[s.id]?.email || ''} onChange={(e) => setStaffCreds((prev) => ({ ...prev, [s.id]: { email: e.target.value, pass: prev[s.id]?.pass || '' } }))} placeholder="e.g. name@vis.edu" className="text-xs rounded-sm border border-brand-cream-dark px-2 py-1 min-w-[170px]" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input value={staffCreds[s.id]?.pass || ''} onChange={(e) => setStaffCreds((prev) => ({ ...prev, [s.id]: { email: prev[s.id]?.email || '', pass: e.target.value } }))} placeholder="Auto-generate or type" className="text-xs rounded-sm border border-brand-cream-dark px-2 py-1 min-w-[130px]" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Button type="button" variant="primary" onClick={saveStaff} disabled={saving} className="self-start">
                  {saving ? 'Saving…' : '💾 Save & Activate Accounts'}
                </Button>
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}
