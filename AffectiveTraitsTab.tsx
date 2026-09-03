import { useEffect, useState } from 'react';
import Card from '../../ui/Card';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import Select from '../../ui/Select';
import Modal from '../../ui/Modal';
import { useToast } from '../../ui/Toast';
import {
  fetchAffectiveTraitsData,
  generateHubTraits,
  saveHubTrait,
  genAffectiveTraits,
  TRAIT_NAMES,
  TRAIT_LABELS,
  type HubStudent,
  type HubTraitRecord,
  type TraitEntry,
} from '../../../lib/class-hub';

interface Props {
  classId: string;
  className: string;
  term: string;
  session: string;
}

// Mirrors hubAffectiveTraits()/hubGenAllTraits()/hubOverrideTrait()/hubSaveTrait().
export default function AffectiveTraitsTab({ classId, className, term, session }: Props) {
  const toast = useToast();
  const [students, setStudents] = useState<HubStudent[]>([]);
  const [traits, setTraits] = useState<Record<string, HubTraitRecord>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<HubStudent | null>(null);
  const [editRatings, setEditRatings] = useState<Record<string, number>>({});

  const load = () => {
    setLoading(true);
    fetchAffectiveTraitsData(classId, term, session)
      .then(({ students, traits }) => {
        setStudents(students);
        setTraits(traits);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, term, session]);

  const genCount = students.filter((s) => traits[s.id]).length;

  const onGenerate = async (override: boolean) => {
    setBusy(true);
    const res = await generateHubTraits(classId, className, term, session, students, traits, override);
    setBusy(false);
    if (!res.ok) {
      toast.show('danger', res.error || 'Error generating traits.');
      return;
    }
    toast.show('success', `Traits generated for ${res.count} student(s)!`);
    load();
  };

  const openEdit = (s: HubStudent) => {
    const existing = traits[s.id]?.traits ?? genAffectiveTraits(50);
    const ratings: Record<string, number> = {};
    TRAIT_NAMES.forEach((tn) => {
      ratings[tn] = existing.find((t) => t.trait === tn)?.rating ?? 3;
    });
    setEditRatings(ratings);
    setEditing(s);
  };

  const onSaveTrait = async () => {
    if (!editing) return;
    const entries: TraitEntry[] = TRAIT_NAMES.map((tn) => ({ trait: tn, rating: editRatings[tn] ?? 3 }));
    const err = await saveHubTrait(editing.id, editing.full_name, classId, className, term, session, entries);
    if (err) {
      toast.show('danger', 'Error: ' + err);
      return;
    }
    toast.show('success', `Traits saved for ${editing.full_name}!`);
    setEditing(null);
    load();
  };

  if (loading) return <p className="text-sm text-brand-brown-light">Loading…</p>;

  return (
    <div>
      <Card className="mb-4 border-l-4 border-brand-brown">
        <p className="font-heading font-bold text-brand-brown-dark mb-2">
          Affective Traits — {className} · {term} · {session}
        </p>
        <div className="flex flex-wrap gap-2 mb-2">
          <Button size="sm" onClick={() => onGenerate(false)} disabled={busy}>
            Auto-Generate Missing ({students.length - genCount})
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onGenerate(true)} disabled={busy}>
            Override All ({students.length})
          </Button>
        </div>
        <p className="text-xs text-brand-brown-light">
          Generated from each student's average score. Override per student with custom ratings.
        </p>
      </Card>

      <Card>
        <table className="w-full text-sm text-left">
          <thead className="text-brand-brown-dark">
            <tr>
              <th className="py-1">#</th>
              <th className="py-1">Student</th>
              <th className="py-1">Status</th>
              <th className="py-1">Sample Traits</th>
              <th className="py-1">Action</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, i) => {
              const has = !!traits[s.id]?.traits?.length;
              return (
                <tr key={s.id} className="border-t border-brand-cream-dark">
                  <td className="py-1.5 text-brand-brown-light">{i + 1}</td>
                  <td className="py-1.5 font-medium text-brand-brown-dark">{s.full_name}</td>
                  <td className="py-1.5">{has ? <Badge tone="success">Done</Badge> : <Badge tone="warning">Pending</Badge>}</td>
                  <td className="py-1.5 text-xs text-brand-brown-light">
                    {has
                      ? traits[s.id].traits
                          .slice(0, 2)
                          .map((t) => `${t.trait}: ${TRAIT_LABELS[t.rating] ?? t.rating}`)
                          .join(' · ') + '…'
                      : '—'}
                  </td>
                  <td className="py-1.5">
                    <Button size="sm" variant="secondary" onClick={() => openEdit(s)}>
                      {has ? 'Override' : 'Generate'}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Traits — ${editing?.full_name ?? ''}`}>
        <div className="flex flex-col gap-2">
          {TRAIT_NAMES.map((tn) => (
            <div key={tn} className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-brand-brown-dark min-w-[160px]">{tn}</span>
              <Select
                id={`trait-${tn}`}
                value={String(editRatings[tn] ?? 3)}
                onChange={(e) => setEditRatings((r) => ({ ...r, [tn]: parseInt(e.target.value) }))}
                options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} — ${TRAIT_LABELS[n]}` }))}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-4">
          <Button className="flex-1" onClick={onSaveTrait}>
            Save
          </Button>
          <Button variant="secondary" onClick={() => setEditing(null)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  );
}
