import { useMemo, useState } from 'react';
import Select from '../ui/Select';

interface Row {
  id: string;
  session: string;
  term: string;
  class_name: string;
  week_number: number;
  status: string;
  days_completed: number;
}
interface ClassOption { id: string; name: string }

interface Props {
  rows: Row[];
  classes: ClassOption[];
}

export default function AttendanceOversight({ rows, classes }: Props) {
  const sessions = useMemo(() => Array.from(new Set(rows.map((r) => r.session))).sort().reverse(), [rows]);
  const terms = useMemo(() => Array.from(new Set(rows.map((r) => r.term))), [rows]);

  const [session, setSession] = useState('');
  const [term, setTerm] = useState('');
  const [className, setClassName] = useState('');

  const filtered = rows.filter(
    (r) => (!session || r.session === session) && (!term || r.term === term) && (!className || r.class_name === className)
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-4 flex flex-wrap gap-3 items-end">
        <Select id="att-f-session" label="Session" placeholder="All Sessions" options={sessions.map((s) => ({ value: s, label: s }))} value={session} onChange={(e) => setSession(e.target.value)} />
        <Select id="att-f-term" label="Term" placeholder="All Terms" options={terms.map((t) => ({ value: t, label: t }))} value={term} onChange={(e) => setTerm(e.target.value)} />
        <Select id="att-f-class" label="Class" placeholder="All Classes" options={classes.map((c) => ({ value: c.name, label: c.name }))} value={className} onChange={(e) => setClassName(e.target.value)} />
      </div>

      <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-brand-cream text-xs uppercase text-brand-brown-light">
            <tr>
              <th className="text-left px-4 py-2.5">Session</th>
              <th className="text-left px-4 py-2.5">Term</th>
              <th className="text-left px-4 py-2.5">Class</th>
              <th className="text-left px-4 py-2.5">Week</th>
              <th className="text-left px-4 py-2.5">Status</th>
              <th className="text-left px-4 py-2.5">Days Marked</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center px-4 py-8 text-brand-brown-light">
                  No attendance weeks match this filter.
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-brand-cream-dark">
                <td className="px-4 py-2.5">{r.session}</td>
                <td className="px-4 py-2.5">{r.term}</td>
                <td className="px-4 py-2.5 font-medium text-brand-brown-dark">{r.class_name}</td>
                <td className="px-4 py-2.5">Week {r.week_number}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      r.status === 'closed' ? 'bg-success-700/10 text-success-700' : r.status === 'active' ? 'bg-warning-700/10 text-warning-700' : 'bg-brand-cream text-brand-brown-light'
                    }`}
                  >
                    {r.status === 'closed' ? 'Done' : r.status === 'active' ? 'Active' : r.status}
                  </span>
                </td>
                <td className="px-4 py-2.5">{r.days_completed}/5</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
