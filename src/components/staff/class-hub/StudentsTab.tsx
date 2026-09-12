import { useEffect, useState } from 'react';
import Card from '../../ui/Card';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Table, { type TableColumn } from '../../ui/Table';
import { useToast } from '../../ui/Toast';
import { fetchHubStudents, toggleStudentBlock, type HubStudent } from '../../../lib/class-hub';

interface Props {
  classId: string;
  className: string;
}

// Mirrors hubStudents() — full roster for the selected class, with search
// and block/unblock. "Add Student" and "Edit Student" reuse the existing
// showAddStudentModal()/editStudent() flow from the Students screen
// (Feature Checklist row 4) once that screen is ported — not duplicated
// here. "Print List" (printClassStudentListPDF) is a jsPDF concern left
// for the component's PDF pass, per the class-hub.ts header note.
export default function StudentsTab({ classId, className }: Props) {
  const toast = useToast();
  const [students, setStudents] = useState<HubStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const load = () => {
    setLoading(true);
    fetchHubStudents(classId)
      .then(setStudents)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const onToggleBlock = async (s: HubStudent) => {
    const err = await toggleStudentBlock(s.id, !s.blocked);
    if (err) {
      toast.show('danger', 'Error: ' + err);
      return;
    }
    toast.show('success', s.blocked ? 'Student unblocked.' : 'Student blocked.');
    load();
  };

  const filtered = query.trim()
    ? students.filter(
        (s) =>
          s.full_name.toLowerCase().includes(query.toLowerCase()) ||
          (s.admission_number ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : students;

  const columns: TableColumn<HubStudent>[] = [
    { key: 'admission_number', header: 'Adm No', render: (s) => s.admission_number || '—' },
    { key: 'full_name', header: 'Full Name' },
    { key: 'gender', header: 'Gender', render: (s) => s.gender || '—' },
    { key: 'parent_name', header: 'Parent', render: (s) => s.parent_name || '—' },
    {
      key: 'status',
      header: 'Status',
      render: (s) =>
        s.blocked ? (
          <Badge tone="danger">Blocked</Badge>
        ) : s.has_account ? (
          <Badge tone="success">Active</Badge>
        ) : (
          <Badge tone="warning">Pending</Badge>
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (s) => (
        <Button size="sm" variant={s.blocked ? 'secondary' : 'danger'} onClick={() => onToggleBlock(s)}>
          {s.blocked ? 'Unblock' : 'Block'}
        </Button>
      ),
    },
  ];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="font-heading font-bold text-brand-brown-dark">{className}</span>
          <Badge tone="neutral">{students.length} students</Badge>
        </div>
        <Input id="hub-stu-search" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {loading ? (
        <p className="text-sm text-brand-brown-light">Loading…</p>
      ) : (
        <Table columns={columns} rows={filtered} getRowKey={(s) => s.id} emptyMessage="No students in this class." />
      )}
    </Card>
  );
}
