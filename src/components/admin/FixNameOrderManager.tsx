import { useState } from 'react';
import Select from '../ui/Select';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { reorderNameFull, fmtStuName } from '../../lib/fixNameOrder';

interface ClassOption { id: string; name: string; arm: string | null }
interface PersonRow { id: string; full_name: string; admission_number?: string; role?: string }
interface RowState extends PersonRow {
  parts: string[];
  surIdx: number;
  firIdx: number | null;
  checked: boolean;
}

async function callAPI(payload: object) {
  const res = await fetch('/api/admin/fix-name-order/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function buildInitialRow(p: PersonRow): RowState {
  const parts = (p.full_name || '').trim().split(/\s+/).filter(Boolean);
  return { ...p, parts, surIdx: 0, firIdx: parts.length > 1 ? 1 : null, checked: false };
}

// The purple "Set pattern by word position" box — same 4-option range
// the old app uses (index.html lines 8059-8061), since names rarely run
// past 4 tokens in practice.
const WORD_POSITIONS = [0, 1, 2, 3];

function ReorderTable({
  rows, setRows, kind, isStudent,
}: {
  rows: RowState[];
  setRows: (fn: (prev: RowState[]) => RowState[]) => void;
  kind: 'stu' | 'staff';
  isStudent: boolean;
}) {
  const [patSur, setPatSur] = useState(0);
  const [patFir, setPatFir] = useState(1);
  const toast = useToast();

  function toggleAll(checked: boolean) {
    setRows((prev) => prev.map((r) => ({ ...r, checked })));
  }
  function toggleOne(id: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, checked: !r.checked } : r)));
  }
  function updateRow(id: string, field: 'surIdx' | 'firIdx', value: number | null) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }
  function applyPattern() {
    let applied = 0, skipped = 0;
    setRows((prev) =>
      prev.map((r) => {
        if (!r.checked) return r;
        const maxIdx = r.parts.length - 1;
        if (patSur > maxIdx || patFir > maxIdx) { skipped++; return r; }
        applied++;
        return { ...r, surIdx: patSur, firIdx: patFir };
      })
    );
    toast.show(skipped ? 'warning' : 'success', skipped ? `✅ Pattern applied to ${applied}, ⚠️ ${skipped} skipped (not enough words).` : `✅ Pattern applied to ${applied} row(s).`);
  }

  const checkedCount = rows.filter((r) => r.checked).length;
  const allChecked = rows.length > 0 && checkedCount === rows.length;

  return (
    <>
      <div className="flex justify-between items-center mb-2.5 flex-wrap gap-2">
        <label className="flex items-center gap-2 text-sm font-bold text-brand-brown-dark cursor-pointer">
          <input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} />
          Select All
        </label>
        <span className="text-xs text-brand-brown-light">{checkedCount} selected</span>
      </div>

      <div className="bg-[#EDE9FE] border border-[#DDD6FE] rounded-xl p-3.5 mb-3.5 flex gap-3 items-end flex-wrap">
        <div>
          <div className="text-xs font-semibold text-[#5B21B6] mb-1">Set pattern by word position</div>
          <div className="flex gap-2 items-center flex-wrap">
            <span className="text-xs text-[#5B21B6]">Surname = word #</span>
            <select className="rounded border border-brand-cream-dark px-2 py-1 text-sm" value={patSur} onChange={(e) => setPatSur(Number(e.target.value))}>
              {WORD_POSITIONS.map((i) => <option key={i} value={i}>{i + 1}</option>)}
            </select>
            <span className="text-xs text-[#5B21B6]">First = word #</span>
            <select className="rounded border border-brand-cream-dark px-2 py-1 text-sm" value={patFir} onChange={(e) => setPatFir(Number(e.target.value))}>
              {WORD_POSITIONS.map((i) => <option key={i} value={i}>{i + 1}</option>)}
            </select>
          </div>
        </div>
        <Button variant="secondary" onClick={applyPattern} className="text-[#7C3AED] border-[#7C3AED]">⚡ Apply Pattern to Checked Rows</Button>
      </div>

      <div className="overflow-x-auto bg-white rounded-lg border border-brand-cream-dark">
        <table className="w-full text-sm">
          <thead className="bg-brand-cream text-xs uppercase text-brand-brown-light">
            <tr>
              <th className="w-9 px-2 py-2"></th>
              <th className="text-left px-3 py-2">{isStudent ? 'Adm No' : 'Role'}</th>
              <th className="text-left px-3 py-2">Current Name</th>
              <th className="text-left px-3 py-2">Surname</th>
              <th className="text-left px-3 py-2">First Name</th>
              <th className="text-left px-3 py-2">After Reorder</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const swapped = reorderNameFull(r.full_name, r.surIdx, r.firIdx);
              const preview = isStudent ? fmtStuName(swapped) : swapped;
              return (
                <tr key={r.id} className="border-t border-brand-cream-dark">
                  <td className="px-2 py-2"><input type="checkbox" checked={r.checked} onChange={() => toggleOne(r.id)} /></td>
                  <td className="px-3 py-2 text-brand-brown-light text-xs">{isStudent ? (r.admission_number || '—') : (r.role || '').replace(/_/g, ' ')}</td>
                  <td className="px-3 py-2 font-semibold text-brand-brown-dark">{isStudent ? fmtStuName(r.full_name) : r.full_name}</td>
                  <td className="px-3 py-2">
                    <select className="rounded border border-brand-cream-dark px-2 py-1 text-xs" value={r.surIdx} onChange={(e) => updateRow(r.id, 'surIdx', Number(e.target.value))}>
                      {r.parts.map((tok, i) => <option key={i} value={i}>{tok}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select className="rounded border border-brand-cream-dark px-2 py-1 text-xs" value={r.firIdx ?? ''} onChange={(e) => updateRow(r.id, 'firIdx', e.target.value === '' ? null : Number(e.target.value))}>
                      {r.parts.map((tok, i) => <option key={i} value={i}>{tok}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 font-semibold text-success-700">{preview}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function FixNameOrderManager({ classes }: { classes: ClassOption[] }) {
  const [tab, setTab] = useState<'students' | 'staff'>('students');
  const [classId, setClassId] = useState('');
  const [studentRows, setStudentRows] = useState<RowState[]>([]);
  const [staffRows, setStaffRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const toast = useToast();

  async function loadStudents(id: string) {
    setClassId(id);
    setStudentRows([]);
    if (!id) return;
    setLoading(true);
    try {
      const data = await callAPI({ action: 'studentsByClass', classId: id });
      setStudentRows((data.students || []).map(buildInitialRow));
    } catch (e: any) {
      toast.show('danger', e.message || 'Could not load students.');
    } finally {
      setLoading(false);
    }
  }

  async function loadStaff() {
    setLoading(true);
    try {
      const data = await callAPI({ action: 'staffList' });
      setStaffRows((data.staff || []).map(buildInitialRow));
    } catch (e: any) {
      toast.show('danger', e.message || 'Could not load staff.');
    } finally {
      setLoading(false);
    }
  }

  function switchTab(t: 'students' | 'staff') {
    setTab(t);
    if (t === 'staff' && staffRows.length === 0) loadStaff();
  }

  const activeRows = tab === 'students' ? studentRows : staffRows;
  const checkedRows = activeRows.filter((r) => r.checked);

  async function confirmApply() {
    setApplying(true);
    try {
      const items = checkedRows.map((r) => ({ id: r.id, fullName: r.full_name, surnameIdx: r.surIdx, firstIdx: r.firIdx }));
      const data = await callAPI({ action: tab === 'students' ? 'applyStudents' : 'applyStaff', items });
      toast.show(data.failed ? 'warning' : 'success', data.failed ? `✅ ${data.applied} reordered, ⚠️ ${data.failed} failed.` : `✅ ${data.applied} name(s) reordered successfully!`);
      setConfirmOpen(false);
      if (tab === 'students') await loadStudents(classId);
      else await loadStaff();
    } catch (e: any) {
      toast.show('danger', e.message || 'Could not apply reorder.');
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm overflow-hidden">
      <div className="flex border-b border-brand-cream-dark">
        <button
          onClick={() => switchTab('students')}
          className={`flex-1 py-3.5 font-bold text-sm ${tab === 'students' ? 'bg-brand-brown text-white' : 'bg-brand-cream text-brand-brown-dark'}`}
        >
          👥 Students (Class by Class)
        </button>
        <button
          onClick={() => switchTab('staff')}
          className={`flex-1 py-3.5 font-bold text-sm ${tab === 'staff' ? 'bg-brand-brown text-white' : 'bg-brand-cream text-brand-brown-dark'}`}
        >
          🧑‍🏫 Staff
        </button>
      </div>

      <div className="p-4 bg-warning-soft text-warning-700 text-xs border-b border-brand-cream-dark">
        ⚠️ Check the rows that share the same wrong order, set <strong>Surname = word #</strong> / <strong>First = word #</strong> once in the purple box, then click <strong>Apply Pattern to Checked Rows</strong> — it fills every checked row's dropdowns to match. You can still fine-tune individual rows afterward. Leftover word(s) auto-fill as Middle Name(s). This cannot be auto-undone.
      </div>

      <div className="p-4 flex flex-col gap-4">
        {tab === 'students' && (
          <Select
            id="fno-class" label="Class" placeholder="Select a class…" value={classId}
            onChange={(e) => loadStudents(e.target.value)}
            options={classes.map((c) => ({ value: c.id, label: `${c.name}${c.arm ? ' ' + c.arm : ''}` }))}
          />
        )}

        {loading && <div className="text-center py-8 text-brand-brown-light text-sm">Loading…</div>}

        {!loading && tab === 'students' && !classId && (
          <div className="text-center py-8 text-brand-brown-light text-sm">Select a class to load its student list.</div>
        )}
        {!loading && tab === 'students' && classId && studentRows.length === 0 && (
          <div className="text-center py-8 text-brand-brown-light text-sm">No students in this class.</div>
        )}
        {!loading && tab === 'students' && studentRows.length > 0 && (
          <>
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => setConfirmOpen(true)} disabled={checkedRows.length === 0}>
                🔁 Apply Selected Reorderings
              </Button>
            </div>
            <ReorderTable rows={studentRows} setRows={setStudentRows} kind="stu" isStudent />
          </>
        )}

        {!loading && tab === 'staff' && staffRows.length === 0 && (
          <div className="text-center py-8 text-brand-brown-light text-sm">No staff found.</div>
        )}
        {!loading && tab === 'staff' && staffRows.length > 0 && (
          <>
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => setConfirmOpen(true)} disabled={checkedRows.length === 0}>
                🔁 Apply Selected Reorderings
              </Button>
            </div>
            <ReorderTable rows={staffRows} setRows={setStaffRows} kind="staff" isStudent={false} />
          </>
        )}
      </div>

      {confirmOpen && (
        <Modal open onClose={() => setConfirmOpen(false)} title="⚠️ Confirm Name Reorder">
          <div className="flex flex-col gap-4 min-w-[280px]">
            <p className="text-sm text-brand-brown-light leading-relaxed">
              This will reorder names for <strong>{checkedRows.length}</strong> selected {tab === 'students' ? 'student' : 'staff member'}{checkedRows.length > 1 ? 's' : ''} using the Surname and First Name you picked for each. This cannot be auto-undone.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setConfirmOpen(false)} className="flex-1">Cancel</Button>
              <Button variant="primary" onClick={confirmApply} disabled={applying} className="flex-1">{applying ? 'Applying…' : 'Confirm'}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
