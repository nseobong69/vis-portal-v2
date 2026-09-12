import { useEffect, useState } from 'react';
import Card from '../../ui/Card';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import { fetchPublishList, toggleResultPublish, publishAllResults, type PublishRow } from '../../../lib/class-hub';

interface Props {
  classId: string;
  className: string;
  term: string;
  session: string;
}

// Mirrors hubPublishResult()/hubLoadPublishList()/hubTogglePublish()/hubPublishAll().
export default function PublishResultTab({ classId, className, term, session }: Props) {
  const toast = useToast();
  const [rows, setRows] = useState<PublishRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetchPublishList(classId, term, session)
      .then(setRows)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, term, session]);

  const pubCount = rows.filter((r) => r.published).length;

  const onToggle = async (r: PublishRow) => {
    const err = await toggleResultPublish(r.student_id, classId, term, session, !r.published);
    if (err) {
      toast.show('danger', 'Error: ' + err);
      return;
    }
    toast.show('success', r.published ? 'Result hidden.' : 'Result published!');
    load();
  };

  const onBulk = async (publish: boolean) => {
    if (!confirm(`${publish ? 'Publish' : 'Unpublish'} ALL results for ${className} · ${term} · ${session}?`)) return;
    const err = await publishAllResults(classId, term, session, publish);
    if (err) {
      toast.show('danger', 'Error: ' + err);
      return;
    }
    toast.show('success', publish ? 'All results published!' : 'All results hidden.');
    load();
  };

  if (loading) return <p className="text-sm text-brand-brown-light">Loading…</p>;

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Card><p className="text-xs text-brand-brown-light">Total</p><p className="text-xl font-bold text-brand-brown-dark">{rows.length}</p></Card>
        <Card><p className="text-xs text-brand-brown-light">Published</p><p className="text-xl font-bold text-success-700">{pubCount}</p></Card>
        <Card><p className="text-xs text-brand-brown-light">Hidden</p><p className="text-xl font-bold text-danger-700">{rows.length - pubCount}</p></Card>
      </div>

      <Card>
        <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
          <span className="font-heading font-bold text-brand-brown-dark">{term} · {session}</span>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onBulk(true)}>Publish All</Button>
            <Button size="sm" variant="danger" onClick={() => onBulk(false)}>Unpublish All</Button>
          </div>
        </div>
        <table className="w-full text-sm text-left">
          <thead className="text-brand-brown-dark">
            <tr>
              <th className="py-1">#</th><th className="py-1">Student</th><th className="py-1">Adm No</th>
              <th className="py-1">Has Results</th><th className="py-1">Status</th><th className="py-1">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.student_id} className="border-t border-brand-cream-dark">
                <td className="py-1.5 text-brand-brown-light">{i + 1}</td>
                <td className="py-1.5 font-medium text-brand-brown-dark">{r.full_name}</td>
                <td className="py-1.5 text-xs text-brand-brown-light">{r.admission_number || '—'}</td>
                <td className="py-1.5">{r.has_results ? <Badge tone="success">Yes</Badge> : <Badge tone="danger">No</Badge>}</td>
                <td className="py-1.5">{r.published ? <Badge tone="success">Published</Badge> : <Badge tone="warning">Hidden</Badge>}</td>
                <td className="py-1.5">
                  {r.has_results ? (
                    <Button size="sm" variant={r.published ? 'danger' : 'secondary'} onClick={() => onToggle(r)}>
                      {r.published ? 'Unpublish' : 'Publish'}
                    </Button>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
