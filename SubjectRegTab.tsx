import { useEffect, useState } from 'react';
import Card from '../../ui/Card';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import {
  fetchSubjectRegData,
  registerAllStudentsAllSubjects,
  type SubjectOption,
  type HubStudent,
  type SubjectRegRow,
} from '../../../lib/class-hub';

interface Props {
  classId: string;
  className: string;
  term: string;
  session: string;
}

// Mirrors hubSubjectReg()/hubRegisterAll(). "Selected" (hubRegisterModal /
// hubRegisterSubmit — register one student, or a chosen subset of
// subjects) and "PDF Slips" (hubDownloadSubjRegPDF) are left for the next
// pass: registerSelected() already exists in class-hub.ts for the modal
// once it's built; the PDF slip generator is a jsPDF concern per the
// class-hub.ts header note.
export default function SubjectRegTab({ classId, className, term, session }: Props) {
  const toast = useToast();
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [students, setStudents] = useState<HubStudent[]>([]);
  const [registered, setRegistered] = useState<SubjectRegRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);

  const load = () => {
    setLoading(true);
    fetchSubjectRegData(classId, term, session)
      .then(({ subjects, students, registered }) => {
        setSubjects(subjects);
        setStudents(students);
        setRegistered(registered);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, term, session]);

  const onRegisterAll = async () => {
    if (!subjects.length || !students.length) {
      toast.show('danger', 'No subjects or students found.');
      return;
    }
    if (!confirm(`Register all ${students.length} students for all ${subjects.length} subjects in ${className}?`)) return;
    setRegistering(true);
    const res = await registerAllStudentsAllSubjects(classId, className, students, subjects, term, session);
    setRegistering(false);
    if (!res.ok) {
      toast.show('danger', 'Error: ' + res.error);
      return;
    }
    toast.show('success', `Registered ${students.length} students for ${subjects.length} subjects!`);
    load();
  };

  if (loading) return <p className="text-sm text-brand-brown-light">Loading…</p>;

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title={`Subjects in ${className} (${subjects.length})`}>
        {subjects.length === 0 ? (
          <p className="text-sm text-brand-brown-light">No subjects assigned to this class yet.</p>
        ) : (
          <>
            <ul className="divide-y divide-brand-cream-dark">
              {subjects.map((s) => (
                <li key={s.id} className="flex justify-between items-center py-2">
                  <span className="font-medium text-brand-brown-dark text-sm">{s.name}</span>
                  <Badge tone="neutral">{s.code || '—'}</Badge>
                </li>
              ))}
            </ul>
            <div className="flex gap-2 mt-4">
              <Button size="sm" onClick={onRegisterAll} disabled={registering}>
                {registering ? 'Registering…' : 'Register All'}
              </Button>
            </div>
          </>
        )}
      </Card>

      <Card title={`Registered (${registered.length}) — ${session} · ${term}`}>
        <div className="max-h-[340px] overflow-y-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-brand-brown-dark">
              <tr>
                <th className="py-1">Student</th>
                <th className="py-1">Subjects</th>
                <th className="py-1">No.</th>
              </tr>
            </thead>
            <tbody>
              {registered.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center py-6 text-brand-brown-light">
                    No registrations yet.
                  </td>
                </tr>
              ) : (
                registered.map((r) => (
                  <tr key={r.student_id} className="border-t border-brand-cream-dark">
                    <td className="py-1.5 font-medium text-brand-brown-dark">{r.student_name}</td>
                    <td className="py-1.5 text-xs">{r.subject_names.join(', ')}</td>
                    <td className="py-1.5"><Badge tone="neutral">{r.subject_names.length}</Badge></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
