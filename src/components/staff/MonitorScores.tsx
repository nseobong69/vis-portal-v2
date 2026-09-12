import { useEffect, useMemo, useState } from 'react';
import Select from '../ui/Select';
import Button from '../ui/Button';
import Table from '../ui/Table';
import {
  fetchMyClasses,
  fetchSubjectsFor,
  fetchMonitorScores,
  grade,
  type ClassOption,
  type SubjectOption,
  type MonitorSummaryRow,
  type MonitorScoreRow,
} from '../../lib/results';

const TERMS = ['1st Term', '2nd Term', '3rd Term'];
const SESSIONS = ['2024/2025', '2025/2026'];

interface Props {
  role: string;
  userId: string;
}

export default function MonitorScores({ role, userId }: Props) {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [session, setSession] = useState(SESSIONS[1]);
  const [term, setTerm] = useState(TERMS[0]);
  const [subjectName, setSubjectName] = useState('');
  const [classId, setClassId] = useState('');

  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);
  const [summaryRows, setSummaryRows] = useState<MonitorSummaryRow[]>([]);
  const [detailRows, setDetailRows] = useState<MonitorScoreRow[]>([]);
  const [totalEntered, setTotalEntered] = useState(0);
  const [classesWithData, setClassesWithData] = useState(0);
  const [scopedCount, setScopedCount] = useState(0);

  useEffect(() => {
    fetchMyClasses(role, userId).then(setClasses);
    fetchSubjectsFor(role, userId).then(setSubjects);
  }, [role, userId]);

  const sortedDetail = useMemo(
    () =>
      [...detailRows].sort(
        (a, b) =>
          (a.class_name || '').localeCompare(b.class_name || '') ||
          (a.subject_name || '').localeCompare(b.subject_name || '') ||
          (a.student_name || '').localeCompare(b.student_name || '')
      ),
    [detailRows]
  );

  async function handleCheck() {
    setLoading(true);
    setChecked(false);
    try {
      const scopedClasses = classId ? classes.filter((c) => c.id === classId) : classes;
      if (!scopedClasses.length) {
        setSummaryRows([]);
        setDetailRows([]);
        setChecked(true);
        return;
      }
      const classIds = scopedClasses.map((c) => c.id);
      const res = await fetchMonitorScores(classIds, term, session, subjectName, scopedClasses);
      setSummaryRows(res.summaryRows);
      setDetailRows(res.detailRows);
      setTotalEntered(res.totalEntered);
      setClassesWithData(res.classesWithData);
      setScopedCount(scopedClasses.length);
      setChecked(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-brand-cream-dark bg-white p-5">
        <div className="mb-4 font-heading font-semibold text-sm text-brand-brown-dark">
          Monitor Entered Scores
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Select
            id="mon-sess"
            label="Session"
            value={session}
            onChange={(e) => setSession(e.target.value)}
            options={SESSIONS.map((s) => ({ value: s, label: s }))}
          />
          <Select
            id="mon-term"
            label="Term"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            options={TERMS.map((t) => ({ value: t, label: t }))}
          />
          <Select
            id="mon-subj"
            label="Subject"
            placeholder="All Subjects"
            value={subjectName}
            onChange={(e) => setSubjectName(e.target.value)}
            options={subjects.map((s) => ({ value: s.name, label: s.name }))}
          />
          <Select
            id="mon-cid"
            label="Class"
            placeholder="All Classes"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            options={classes.map((c) => ({ value: c.id, label: `${c.name}${c.arm ? ' ' + c.arm : ''}` }))}
          />
          <Button onClick={handleCheck} disabled={loading}>
            {loading ? 'Checking…' : 'Check'}
          </Button>
        </div>
      </div>

      {!checked ? null : (
        <>
          <div className="rounded-md border border-brand-cream-dark bg-white px-5 py-4 text-xs text-brand-brown-light">
            <strong className="text-brand-brown-dark">{subjectName || 'All Subjects'}</strong> · {term} · {session} —{' '}
            <strong className="text-brand-brown-dark">{totalEntered}</strong> score(s) entered across{' '}
            <strong className="text-brand-brown-dark">{classesWithData}</strong> of {scopedCount} class(es) you can view.
          </div>

          <div className="rounded-md border border-brand-cream-dark bg-white overflow-x-auto">
            <Table
              columns={[
                { key: 'cname', header: 'Class' },
                { key: 'subj', header: 'Subject' },
                { key: 'total', header: 'Students' },
                { key: 'entered', header: 'Scores Entered' },
                {
                  key: 'status',
                  header: 'Status',
                  render: (row: MonitorSummaryRow) => {
                    if (row.entered === 0)
                      return (
                        <span className="rounded-full px-2 py-0.5 text-xs bg-danger-soft text-danger-700">Not started</span>
                      );
                    if (row.entered >= row.total && row.total > 0)
                      return (
                        <span className="rounded-full px-2 py-0.5 text-xs bg-success-soft text-success-700">Complete</span>
                      );
                    return (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={{ background: '#FEF9C3', color: '#A16207' }}
                      >
                        In progress
                      </span>
                    );
                  },
                },
              ]}
              rows={summaryRows}
              getRowKey={(r: MonitorSummaryRow, i: number) => `${r.cname}-${r.subj}-${i}`}
              emptyMessage="No data for this selection."
            />
          </div>

          {detailRows.length > 0 && (
            <div className="rounded-md border border-brand-cream-dark bg-white overflow-hidden">
              <div className="px-4 py-3 font-heading font-semibold text-sm text-brand-brown-dark border-b border-brand-cream-dark">
                Entered Scores — Detail
              </div>
              <div className="overflow-x-auto">
                <Table
                  columns={[
                    { key: 'student_name', header: 'Student' },
                    { key: 'class_name', header: 'Class' },
                    { key: 'subject_name', header: 'Subject' },
                    {
                      key: 'ca_score',
                      header: 'CA',
                      render: (r: MonitorScoreRow) => <span>{r.is_absent ? '-' : r.ca_score ?? '—'}</span>,
                    },
                    {
                      key: 'exam_score',
                      header: 'Exam',
                      render: (r: MonitorScoreRow) => <span>{r.is_absent ? '-' : r.exam_score ?? '—'}</span>,
                    },
                    {
                      key: 'total',
                      header: 'Total',
                      render: (r: MonitorScoreRow) => (
                        <span className="font-semibold">{r.is_absent ? 'AB' : r.total ?? '—'}</span>
                      ),
                    },
                    {
                      key: 'grade',
                      header: 'Grade',
                      render: (r: MonitorScoreRow) => {
                        const gd = r.is_absent || r.grade === 'AB' ? { g: 'AB', c: '#B91C1C' } : grade(r.total ?? 0);
                        return (
                          <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: gd.c + '20', color: gd.c }}>
                            {gd.g}
                          </span>
                        );
                      },
                    },
                  ]}
                  rows={sortedDetail}
                  getRowKey={(r: MonitorScoreRow, i: number) => `${r.student_name}-${r.subject_name}-${i}`}
                  emptyMessage=""
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

