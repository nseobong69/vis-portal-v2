import { useEffect, useState } from 'react';
import Card from '../../ui/Card';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import { fetchClearanceList, toggleStudentClear, clearAllStudents, type ClearanceRow } from '../../../lib/class-hub';

interface Props {
  classId: string;
  className: string;
}

// Mirrors hubClearance()/hubToggleClear()/hubClearAllStudents(). Data
// source matches Feature Checklist row 20 (Student Clearance), re-scoped
// to the Hub's selected class.
export default function ClearanceTab({ classId, className }: Props) {
  const toast = useToast();
  const [rows, setRows] = useState<ClearanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetchClearanceList(classId)
      .then(setRows)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const cleared = rows.filter((r) => r.cleared).length;

  const onToggle = async (r: ClearanceRow) => {
    const err = await toggleStudentClear(r.id, !r.cleared);
    if (err) {
      toast.show('danger', 'Error: ' + err);
      return;
    }
    load();
  };

  const onBulk = async (clear: boolean) => {
    if (!confirm(`${clear ? 'Clear' : 'Unclear'} ALL students in ${className}?`)) return;
    const err = await clearAllStudents(classId, clear);
    if (err) {
      toast.show('danger', 'Error: ' + err);
      return;
    }
    toast.show('success', clear ? 'All students cleared.' : 'All students unclear.');
    load();
  };

  if (loading) return <p className="text-sm text-brand-brown-light">Loading…</p>;

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Card><p className="text-xs text-brand-brown-light">Total</p><p className="text-xl font-bold text-brand-brown-dark">{rows.length}</p></Card>
        <Card><p className="text-xs text-brand-brown-light">Cleared</p><p className="text-xl font-bold text-success-700">{cleared}</p></Card>
        <Card><p className="text-xs text-brand-brown-light">Pending</p><p className="text-xl font-bold text-danger-700">{rows.length - cleared}</p></Card>
      </div>

      <Card>
        <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
          <span className="font-heading font-bold text-brand-brown-dark">{className} — Clearance</span>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onBulk(true)}>Clear All</Button>
            <Button size="sm" variant="danger" onClick={() => onBulk(false)}>Unclear All</Button>
          </div>
        </div>
        <table className="w-full text-sm text-left">
          <thead className="text-brand-brown-dark">
            <tr><th className="py-1">#</th><th className="py-1">Student</th><th className="py-1">Adm No</th><th className="py-1">Clearance</th><th className="py-1">Action</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t border-brand-cream-dark">
                <td className="py-1.5 text-brand-brown-light">{i + 1}</td>
                <td className="py-1.5 font-medium text-brand-brown-dark">{r.full_name}</td>
                <td className="py-1.5 text-xs text-brand-brown-light">{r.admission_number || '—'}</td>
                <td className="py-1.5">{r.cleared ? <Badge tone="success">Cleared</Badge> : <Badge tone="danger">Pending</Badge>}</td>
                <td className="py-1.5">
                  <Button size="sm" variant={r.cleared ? 'danger' : 'secondary'} onClick={() => onToggle(r)}>
                    {r.cleared ? 'Unclear' : 'Clear'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
