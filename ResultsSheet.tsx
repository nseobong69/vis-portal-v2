import { useEffect, useMemo, useState } from 'react';
import Select from '../ui/Select';
import Button from '../ui/Button';
import Table from '../ui/Table';
import Modal from '../ui/Modal';
import { useToast } from '../ui/Toast';
import {
  fetchMyClasses,
  fetchSubjectsFor,
  checkSheetAccess,
  fetchSheetData,
  saveSheet,
  calcPositions,
  fetchBlockList,
  applyResultBlocks,
  grade,
  isAbsentEntry,
  DEFAULT_BLOCK_MESSAGE,
  type ClassOption,
  type SubjectOption,
  type SheetRow,
  type BlockRow,
} from '../../lib/results';

const TERMS = ['1st Term', '2nd Term', '3rd Term'];
const SESSIONS = ['2024/2025', '2025/2026'];

interface Props {
  role: string;
  userId: string;
}

interface RowState extends SheetRow {
  total: string; // display value, mirrors #t{i}
  gradeLabel: string;
  remark: string;
  color: string;
}

function computeRow(row: SheetRow): RowState {
  const caRaw = row.ca.trim();
  const emRaw = row.em.trim();
  if (isAbsentEntry(caRaw, emRaw)) {
    return { ...row, total: 'AB', gradeLabel: 'AB', remark: 'Absent', color: '#B91C1C' };
  }
  if (caRaw === '' && emRaw === '') {
    return { ...row, total: '—', gradeLabel: '—', remark: '—', color: '#999' };
  }
  const ca = parseFloat(caRaw) || 0;
  const em = parseFloat(emRaw) || 0;
  if (caRaw === '' || emRaw === '') {
    return { ...row, total: '—', gradeLabel: '—', remark: '—', color: '#999' };
  }
  const tot = parseFloat((ca + em).toFixed(2));
  const gd = grade(tot);
  return { ...row, total: String(tot), gradeLabel: gd.g, remark: gd.r, color: gd.c };
}

export default function ResultsSheet({ role, userId }: Props) {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [term, setTerm] = useState(TERMS[0]);
  const [session, setSession] = useState(SESSIONS[1]);

  const [rows, setRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [calcing, setCalcing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { show: toastShow } = useToast();

  const [blockOpen, setBlockOpen] = useState(false);
  const [blockRows, setBlockRows] = useState<(BlockRow & { name: string; admNo: string })[]>([]);
  const [blockLoading, setBlockLoading] = useState(false);
  const [blockSaving, setBlockSaving] = useState(false);

  useEffect(() => {
    fetchMyClasses(role, userId).then(setClasses);
    fetchSubjectsFor(role, userId).then(setSubjects);
  }, [role, userId]);

  const className = useMemo(() => {
    const c = classes.find((c) => c.id === classId);
    return c ? `${c.name}${c.arm ? ' ' + c.arm : ''}` : '';
  }, [classes, classId]);

  const subjectName = useMemo(() => subjects.find((s) => s.id === subjectId)?.name ?? '', [subjects, subjectId]);

  function toast(text: string, error = false) {
    toastShow(error ? 'danger' : 'success', text);
  }

  async function handleLoad() {
    if (!classId || !subjectId) {
      toast('Select class and subject.', true);
      return;
    }
    const accessErr = await checkSheetAccess(role, userId, classId, subjectId);
    if (accessErr) {
      toast(accessErr, true);
      return;
    }
    setLoading(true);
    setLoaded(false);
    try {
      const { students, existing } = await fetchSheetData(classId, subjectId, term, session);
      const initial: RowState[] = students.map((s) => {
        const ex = existing[s.id];
        const isAb = !!ex && (ex.is_absent || ex.grade === 'AB');
        const ca = isAb ? '-' : ex?.ca_score != null ? String(ex.ca_score) : '';
        const em = isAb ? '-' : ex?.exam_score != null ? String(ex.exam_score) : '';
        return computeRow({
          student_id: s.id,
          admission_number: s.admission_number,
          student_name: s.full_name,
          ca,
          em,
        });
      });
      setRows(initial);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }

  function updateCell(studentId: string, field: 'ca' | 'em', value: string) {
    setRows((prev) =>
      prev.map((r) => (r.student_id === studentId ? computeRow({ ...r, [field]: value }) : r))
    );
  }

  async function handleSave() {
    if (!rows.length) {
      toast('No data.', true);
      return;
    }
    setSaving(true);
    try {
      const res = await saveSheet(rows, classId, className, subjectId, subjectName, term, session);
      if (!res.ok) {
        toast('Some rows failed: ' + res.error, true);
        return;
      }
      toast(`✅ ${res.saved} results saved!`);
    } finally {
      setSaving(false);
    }
  }

  async function handleCalcPositions() {
    setCalcing(true);
    try {
      const res = await calcPositions(classId, term, session);
      if (!res.ok) {
        toast(res.error ?? 'Could not calculate positions.', true);
        return;
      }
      toast(`✅ Positions calculated for ${res.count} students!`);
    } finally {
      setCalcing(false);
    }
  }

  async function openBlockModal() {
    setBlockOpen(true);
    setBlockLoading(true);
    try {
      const { students, blocks } = await fetchBlockList(classId, term, session);
      setBlockRows(
        students.map((s) => ({
          student_id: s.id,
          name: s.full_name,
          admNo: s.admission_number,
          blocked: blocks[s.id]?.blocked ?? false,
          message: blocks[s.id]?.message ?? DEFAULT_BLOCK_MESSAGE,
        }))
      );
    } finally {
      setBlockLoading(false);
    }
  }

  async function handleApplyBlocks() {
    setBlockSaving(true);
    try {
      const res = await applyResultBlocks(blockRows, term, session, userId);
      if (!res.ok) {
        toast(res.error ?? 'Could not apply block settings.', true);
        return;
      }
      toast(`✅ Block settings applied for ${res.count} students!`);
      setBlockOpen(false);
    } finally {
      setBlockSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-md border border-brand-cream-dark bg-white p-5">
        <div className="mb-4 font-heading font-semibold text-sm text-brand-brown-dark">Load Result Sheet</div>
        <div className="flex flex-wrap items-end gap-3">
          <Select
            id="rs-cid"
            label="Class"
            placeholder="Select Class"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            options={classes.map((c) => ({ value: c.id, label: `${c.name}${c.arm ? ' ' + c.arm : ''}` }))}
          />
          <Select
            id="rs-sid"
            label="Subject"
            placeholder="Select Subject"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            options={subjects.map((s) => ({ value: s.id, label: s.name }))}
          />
          <Select id="rs-term" label="Term" value={term} onChange={(e) => setTerm(e.target.value)} options={TERMS.map((t) => ({ value: t, label: t }))} />
          <Select id="rs-sess" label="Session" value={session} onChange={(e) => setSession(e.target.value)} options={SESSIONS.map((s) => ({ value: s, label: s }))} />
          <Button onClick={handleLoad} disabled={loading}>
            {loading ? 'Loading…' : 'Load'}
          </Button>
        </div>
      </div>

      {!loaded ? (
        <div className="rounded-md border border-brand-cream-dark bg-white p-8 text-center text-brand-brown-light">
          Select class, subject and term to load the sheet.
        </div>
      ) : (
        <div className="rounded-md border border-brand-cream-dark bg-white overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-cream-dark px-5 py-3">
            <div className="font-heading font-semibold text-sm text-brand-brown-dark">
              {className} — {subjectName} — {term}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save All'}
              </Button>
              <Button size="sm" variant="secondary" onClick={handleCalcPositions} disabled={calcing}>
                {calcing ? 'Calculating…' : 'Calc Positions'}
              </Button>
              <Button size="sm" variant="danger" onClick={openBlockModal}>
                Block Results
              </Button>
            </div>
          </div>
          <div className="bg-brand-cream px-4 py-2 text-xs text-brand-brown-light border-b border-brand-cream-dark">
            Scores saved here sync automatically to Class Hub → Publish Result, where the class teacher publishes once all subjects are entered.
          </div>

          <Table
            columns={[
              { key: 'idx', header: '#' },
              { key: 'student_name', header: 'Student' },
              { key: 'admission_number', header: 'Adm No' },
              {
                key: 'ca',
                header: 'CA (30)',
                render: (row: RowState) => (
                  <input
                    type="text"
                    inputMode="numeric"
                    value={row.ca}
                    placeholder="0-30 or -"
                    onChange={(e) => updateCell(row.student_id, 'ca', e.target.value)}
                    className="w-16 rounded-sm border border-brand-cream-dark px-2 py-1 text-center text-sm"
                  />
                ),
              },
              {
                key: 'em',
                header: 'Exam (70)',
                render: (row: RowState) => (
                  <input
                    type="text"
                    inputMode="numeric"
                    value={row.em}
                    placeholder="0-70 or -"
                    onChange={(e) => updateCell(row.student_id, 'em', e.target.value)}
                    className="w-16 rounded-sm border border-brand-cream-dark px-2 py-1 text-center text-sm"
                  />
                ),
              },
              { key: 'total', header: 'Total', render: (row: RowState) => <span className="font-semibold text-brand-brown-dark">{row.total}</span> },
              {
                key: 'gradeLabel',
                header: 'Grade',
                render: (row: RowState) => (
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: row.color + '20', color: row.color }}>
                    {row.gradeLabel}
                  </span>
                ),
              },
              { key: 'remark', header: 'Remark', render: (row: RowState) => <span style={{ color: row.color }}>{row.remark}</span> },
            ]}
            rows={rows.map((r, i) => ({ ...r, idx: i + 1 }))}
            getRowKey={(r: any) => r.student_id}
            emptyMessage="No students in this class."
          />

          <div className="border-t border-brand-cream-dark px-4 py-2 text-xs text-brand-brown-light">
            Enter <b>-</b> in both CA and Exam to mark a student Absent (AB).
          </div>
        </div>
      )}

      <Modal open={blockOpen} onClose={() => setBlockOpen(false)} title={`Block / Unblock Results — ${term}`}>
          {blockLoading ? (
            <div className="p-6 text-center text-brand-brown-light">Loading…</div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="rounded-md bg-brand-cream px-3 py-2 text-xs text-brand-brown-light">
                Select students to block. Edit the message for each, or leave default. Click Apply when done.
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="danger" onClick={() => setBlockRows((prev) => prev.map((r) => ({ ...r, blocked: true })))}>
                  Select All
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setBlockRows((prev) => prev.map((r) => ({ ...r, blocked: false })))}>
                  Deselect All
                </Button>
              </div>
              <div className="max-h-96 overflow-y-auto flex flex-col gap-2">
                {blockRows.map((r, i) => (
                  <div
                    key={r.student_id}
                    className="rounded-md p-3 border"
                    style={{ borderColor: r.blocked ? '#EF4444' : 'var(--tw-color-brand-cream-dark, #e5decf)' }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        checked={r.blocked}
                        onChange={(e) =>
                          setBlockRows((prev) => prev.map((row, idx) => (idx === i ? { ...row, blocked: e.target.checked } : row)))
                        }
                      />
                      <span className="text-sm font-semibold text-brand-brown-dark">{r.name}</span>
                      <span className="text-xs text-brand-brown-light">{r.admNo}</span>
                      <span className={`ml-auto text-xs rounded-full px-2 py-0.5 ${r.blocked ? 'bg-danger-soft text-danger-700' : 'bg-success-soft text-success-700'}`}>
                        {r.blocked ? '🔒 Blocked' : '✓ Active'}
                      </span>
                    </div>
                    <textarea
                      rows={2}
                      value={r.message}
                      onChange={(e) => setBlockRows((prev) => prev.map((row, idx) => (idx === i ? { ...row, message: e.target.value } : row)))}
                      className="w-full rounded-sm border border-brand-cream-dark px-2 py-1 text-xs"
                      style={{ opacity: r.blocked ? 1 : 0.5 }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <Button className="flex-1 justify-center" variant="danger" onClick={handleApplyBlocks} disabled={blockSaving}>
                  {blockSaving ? 'Applying…' : 'Apply Block Settings'}
                </Button>
                <Button variant="secondary" onClick={() => setBlockOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
      </Modal>
    </div>
  );
}
