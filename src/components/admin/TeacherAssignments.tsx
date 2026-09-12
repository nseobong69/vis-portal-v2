import { useEffect, useMemo, useState } from 'react';
import Select from '../ui/Select';
import Button from '../ui/Button';
import { useToast } from '../ui/Toast';
import {
  fetchAssignmentOptions,
  fetchClassAssignPanel,
  assignSubjectTeachers,
  removeSubjectAssign,
  fetchClassTeacherList,
  assignClassTeacher,
  removeClassTeacherAssign,
  type TeacherOption,
  type ClassOption,
  type SubjectOption,
  type SubjectTeacherRow,
  type ClassTeacherRow,
} from '../../lib/assignments';

const multiSelectClass =
  'w-full rounded-sm border border-brand-cream-dark px-2 py-1.5 text-sm h-28';

export default function TeacherAssignments() {
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const { show: toastShow } = useToast();

  function toast(text: string, error = false) {
    toastShow(error ? 'danger' : 'success', text);
  }

  useEffect(() => {
    fetchAssignmentOptions().then(({ teachers, classes, subjects }) => {
      setTeachers(teachers);
      setClasses(classes);
      setSubjects(subjects);
    });
  }, []);

  const classLabel = (c: ClassOption) => `${c.name}${c.arm ? ' ' + c.arm : ''}`;

  // ── Subject-teacher panel (scoped to one selected class) ──
  const [classId, setClassId] = useState('');
  const [panelLoading, setPanelLoading] = useState(false);
  const [subjectRows, setSubjectRows] = useState<SubjectTeacherRow[]>([]);
  const [nullRows, setNullRows] = useState<SubjectTeacherRow[]>([]);
  const [qaTeacherId, setQaTeacherId] = useState('');
  const [qaSubjectIds, setQaSubjectIds] = useState<string[]>([]);

  const selectedClassLabel = useMemo(() => {
    const c = classes.find((c) => c.id === classId);
    return c ? classLabel(c) : '';
  }, [classes, classId]);

  async function loadPanel(cid: string) {
    if (!cid) {
      setSubjectRows([]);
      setNullRows([]);
      return;
    }
    setPanelLoading(true);
    try {
      const { rows, nullRows } = await fetchClassAssignPanel(cid);
      setSubjectRows(rows);
      setNullRows(nullRows);
    } finally {
      setPanelLoading(false);
    }
  }

  async function handleQuickAssign() {
    if (!qaTeacherId) {
      toast('Select a teacher.', true);
      return;
    }
    if (!classId) {
      toast('Select a class first.', true);
      return;
    }
    if (!qaSubjectIds.length) {
      toast('Select at least one subject.', true);
      return;
    }
    const { added, skipped } = await assignSubjectTeachers(qaTeacherId, classId, qaSubjectIds);
    toast(
      added
        ? `✅ ${added} subject teacher${added > 1 ? 's' : ''} added!` + (skipped ? ` (${skipped} already existed)` : '')
        : 'All selected already assigned.'
    );
    setQaSubjectIds([]);
    loadPanel(classId);
  }

  async function handleRemoveSubjectAssign(id: string) {
    await removeSubjectAssign(id);
    toast('Removed.');
    loadPanel(classId);
  }

  // ── Class-teacher panel (all classes) ──
  const [tcTeacherId, setTcTeacherId] = useState('');
  const [tcClassIds, setTcClassIds] = useState<string[]>([]);
  const [classTeacherRows, setClassTeacherRows] = useState<ClassTeacherRow[]>([]);
  const [tcDebug, setTcDebug] = useState('');

  async function loadClassTeacherRows() {
    try {
      const rows = await fetchClassTeacherList();
      setClassTeacherRows(rows);
      setTcDebug(`fetched ${rows.length} row(s) ok`);
    } catch (e: any) {
      setTcDebug(`ERROR: ${e?.message ?? String(e)}`);
    }
  }

  useEffect(() => {
    loadClassTeacherRows();
  }, []);

  async function handleAssignClassTeacher() {
    if (!tcTeacherId) {
      toast('Select a teacher.', true);
      return;
    }
    if (!tcClassIds.length) {
      toast('Select at least one class.', true);
      return;
    }
    const { added, skipped } = await assignClassTeacher(tcTeacherId, tcClassIds);
    toast(
      added
        ? `✅ ${added} class assignment${added > 1 ? 's' : ''} added!` + (skipped ? ` (${skipped} already existed)` : '')
        : 'All selected already assigned.'
    );
    setTcClassIds([]);
    loadClassTeacherRows();
  }

  async function handleRemoveClassTeacherAssign(id: string) {
    await removeClassTeacherAssign(id);
    toast('Removed.');
    loadClassTeacherRows();
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Class picker */}
      <div className="rounded-md border border-brand-cream-dark bg-white p-5">
        <Select
          id="ta-cid"
          label="Select a class to manage"
          placeholder="Choose a class…"
          value={classId}
          onChange={(e) => {
            setClassId(e.target.value);
            loadPanel(e.target.value);
          }}
          options={classes.map((c) => ({ value: c.id, label: classLabel(c) }))}
        />
      </div>

      {/* Subject-teacher panel for the selected class */}
      {classId && (
        <>
          {panelLoading ? (
            <div className="rounded-md border border-brand-cream-dark bg-white p-8 text-center text-brand-brown-light">
              Loading…
            </div>
          ) : (
            <>
              <div className="rounded-md border border-brand-cream-dark bg-white p-5">
                <div className="mb-3 font-heading font-semibold text-sm text-brand-brown-dark">
                  Add Subject Teacher to {selectedClassLabel}
                  <span className="ml-1 text-[10.5px] font-normal text-brand-brown-light">(hold Ctrl/⌘ for multiple)</span>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <Select
                    id="qa-tid"
                    label="Teacher"
                    placeholder="Select teacher"
                    value={qaTeacherId}
                    onChange={(e) => setQaTeacherId(e.target.value)}
                    options={teachers.map((t) => ({ value: t.id, label: t.full_name }))}
                  />
                  <div className="flex-1 min-w-[160px]">
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-xs font-medium text-brand-brown-light">Subjects</label>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="text-[10px] px-2 py-0.5 rounded-sm border border-brand-cream-dark"
                          onClick={() => setQaSubjectIds(subjects.map((s) => s.id))}
                        >
                          All
                        </button>
                        <button
                          type="button"
                          className="text-[10px] px-2 py-0.5 rounded-sm border border-brand-cream-dark"
                          onClick={() => setQaSubjectIds([])}
                        >
                          None
                        </button>
                      </div>
                    </div>
                    <select
                      id="qa-sid"
                      multiple
                      className={multiSelectClass}
                      value={qaSubjectIds}
                      onChange={(e) => setQaSubjectIds(Array.from(e.target.selectedOptions, (o) => o.value))}
                    >
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button onClick={handleQuickAssign}>Add</Button>
                </div>
              </div>

              <div className="rounded-md border border-brand-cream-dark bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-brand-cream-dark font-heading font-semibold text-sm text-brand-brown-dark">
                  Subject Teachers — {selectedClassLabel}
                </div>
                <div className="px-4">
                  {subjectRows.length ? (
                    subjectRows.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between py-2.5 border-b border-brand-cream-dark text-sm"
                      >
                        <span>
                          <b className="text-brand-brown-dark">{r.subject_name}</b> — {r.teacher_name}
                        </span>
                        <Button size="sm" variant="danger" onClick={() => handleRemoveSubjectAssign(r.id)}>
                          ✕
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="py-4 text-sm text-brand-brown-light">No subject teachers assigned to this class yet.</p>
                  )}
                </div>
              </div>

              {nullRows.length > 0 && (
                <div className="rounded-md border-l-4 border-danger-600 bg-white p-4">
                  <div className="mb-2 font-semibold text-sm text-danger-600">
                    ⚠ {nullRows.length} assignment{nullRows.length > 1 ? 's' : ''} with no class set
                  </div>
                  <div className="mb-2 text-xs text-brand-brown-light">
                    These won't grant access to any specific class and should be fixed by removing and re-adding with a class selected.
                  </div>
                  {nullRows.map((r) => (
                    <div key={r.id} className="flex items-center justify-between py-1.5 text-sm">
                      <span>
                        <b>{r.teacher_name}</b> — {r.subject_name} <i className="text-brand-brown-light">(no class)</i>
                      </span>
                      <Button size="sm" variant="danger" onClick={() => handleRemoveSubjectAssign(r.id)}>
                        ✕
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Class-teacher panel (all classes) */}
      <div className="rounded-md border border-brand-cream-dark bg-white p-5">
        <div className="mb-1 font-heading font-semibold text-sm text-brand-brown-dark">
          Class Teacher Assignments (all classes)
          <span className="ml-1 text-[10.5px] font-normal text-brand-brown-light">(hold Ctrl/⌘ for multiple)</span>
        </div>
        <div className="mb-4 text-xs text-brand-brown-light">
          The class teacher has full access to every subject in their class. This is separate from subject-teacher assignments above.
        </div>
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <Select
            id="tc-tid"
            label="Teacher"
            placeholder="Select teacher"
            value={tcTeacherId}
            onChange={(e) => setTcTeacherId(e.target.value)}
            options={teachers.map((t) => ({ value: t.id, label: t.full_name }))}
          />
          <div className="flex-1 min-w-[160px]">
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-brand-brown-light">Classes</label>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="text-[10px] px-2 py-0.5 rounded-sm border border-brand-cream-dark"
                  onClick={() => setTcClassIds(classes.map((c) => c.id))}
                >
                  All
                </button>
                <button
                  type="button"
                  className="text-[10px] px-2 py-0.5 rounded-sm border border-brand-cream-dark"
                  onClick={() => setTcClassIds([])}
                >
                  None
                </button>
              </div>
            </div>
            <select
              id="tc-cid"
              multiple
              className={multiSelectClass}
              value={tcClassIds}
              onChange={(e) => setTcClassIds(Array.from(e.target.selectedOptions, (o) => o.value))}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {classLabel(c)}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={handleAssignClassTeacher}>Assign</Button>
        </div>
        <div className="max-h-72 overflow-y-auto">
          <p className="mb-2 text-[11px] font-mono text-red-600">DEBUG: {tcDebug || 'loading…'}</p>
          {classTeacherRows.length ? (
            classTeacherRows.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2 border-b border-brand-cream-dark text-sm">
                <span>
                  <b className="text-brand-brown-dark">{r.teacher_name}</b> → {r.class_label}
                </span>
                <Button size="sm" variant="danger" onClick={() => handleRemoveClassTeacherAssign(r.id)}>
                  ✕
                </Button>
              </div>
            ))
          ) : (
            <p className="text-sm text-brand-brown-light">No class teacher assignments yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
