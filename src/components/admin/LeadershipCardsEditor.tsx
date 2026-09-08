import { useState } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';

interface LeadershipCard {
  photo: string;
  name: string;
  position: string;
  bio: string;
}

interface Props {
  initialCards: LeadershipCard[];
  initialHeading: string;
  initialSubtitle: string;
}

async function uploadToCloudinary(file: File, folder: string): Promise<string> {
  const signRes = await fetch('/api/admin/settings/sign-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder }),
  });
  const sig = await signRes.json();
  if (!signRes.ok || !sig?.signature) throw new Error(sig?.error || 'Upload signing failed.');

  const fd = new FormData();
  fd.append('file', file);
  fd.append('folder', sig.folder);
  fd.append('public_id', sig.public_id);
  fd.append('api_key', sig.api_key);
  fd.append('signature', sig.signature);
  fd.append('timestamp', String(sig.timestamp));

  const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloud_name}/image/upload`, {
    method: 'POST',
    body: fd,
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.secure_url as string;
}

export default function LeadershipCardsEditor({ initialCards, initialHeading, initialSubtitle }: Props) {
  const [heading, setHeading] = useState(initialHeading);
  const [subtitle, setSubtitle] = useState(initialSubtitle);
  const [cards, setCards] = useState<LeadershipCard[]>(initialCards);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  function updateCard(i: number, patch: Partial<LeadershipCard>) {
    setCards((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  function addCard() {
    setCards((prev) => [...prev, { photo: '', name: '', position: '', bio: '' }]);
  }

  function removeCard(i: number) {
    setCards((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleUpload(i: number, file: File) {
    setUploadingIdx(i);
    setStatus(null);
    try {
      const url = await uploadToCloudinary(file, 'vis/homepage/leadership');
      updateCard(i, { photo: url });
      setStatus({ tone: 'success', text: 'Photo uploaded.' });
    } catch (e) {
      setStatus({ tone: 'danger', text: e instanceof Error ? e.message : 'Upload failed.' });
    } finally {
      setUploadingIdx(null);
    }
  }

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch('/api/admin/settings/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadership_cards: cards,
          leadership_heading: heading,
          leadership_subtitle: subtitle,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Save failed.');
      setStatus({ tone: 'success', text: '"Meet Our Leadership" saved.' });
    } catch (e) {
      setStatus({ tone: 'danger', text: e instanceof Error ? e.message : 'Save failed.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Input
        id="leadership-heading"
        label="Section Heading"
        value={heading}
        onChange={(e) => setHeading(e.target.value)}
        placeholder="School Administration"
      />
      <Input
        id="leadership-subtitle"
        label="Section Subtitle"
        value={subtitle}
        onChange={(e) => setSubtitle(e.target.value)}
        placeholder="The people guiding the school every day."
      />

      {cards.length === 0 && (
        <p className="text-sm text-brand-brown-light">No leadership profiles yet. Click "Add Person" to add one.</p>
      )}

      {cards.map((c, i) => (
        <div key={i} className="border border-brand-cream-dark rounded-lg p-4 bg-brand-cream flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-heading font-bold text-brand-brown-dark text-sm">Person {i + 1}</span>
            <button type="button" onClick={() => removeCard(i)} className="text-danger-700 text-sm hover:underline">
              Remove
            </button>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-brand-brown-dark">Photo</span>
            <div className="flex items-center gap-3 flex-wrap">
              {c.photo ? (
                <img src={c.photo} alt="" className="object-cover rounded-full border border-brand-cream-dark" style={{ height: 64, width: 64 }} />
              ) : (
                <div className="rounded-full border-2 border-dashed border-brand-brown-light flex items-center justify-center text-xl" style={{ height: 64, width: 64 }}>
                  👤
                </div>
              )}
              <label className="text-xs font-medium px-3 py-1.5 rounded-sm border border-brand-cream-dark bg-white cursor-pointer hover:bg-brand-cream">
                {uploadingIdx === i ? 'Uploading…' : 'Upload to Cloudinary'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingIdx !== null}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(i, file);
                    e.target.value = '';
                  }}
                />
              </label>
              {c.photo && (
                <button type="button" onClick={() => updateCard(i, { photo: '' })} className="text-danger-700 text-xs hover:underline">
                  Remove photo
                </button>
              )}
            </div>
          </div>

          <Input id={`ldr-name-${i}`} label="Full Name" value={c.name} onChange={(e) => updateCard(i, { name: e.target.value })} placeholder="e.g. Mrs. Grace Effiong" />
          <Input id={`ldr-position-${i}`} label="Position" value={c.position} onChange={(e) => updateCard(i, { position: e.target.value })} placeholder="e.g. Head Teacher" />
          <div className="flex flex-col gap-1">
            <label htmlFor={`ldr-bio-${i}`} className="text-sm font-medium text-brand-brown-dark">Brief Info / Bio</label>
            <textarea
              id={`ldr-bio-${i}`}
              rows={3}
              value={c.bio}
              onChange={(e) => updateCard(i, { bio: e.target.value })}
              placeholder="A short bio (1-2 sentences)"
              className="font-body text-sm rounded-sm border border-brand-cream-dark px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold"
            />
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={addCard}>+ Add Person</Button>
        <Button type="button" variant="gold" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save "Meet Our Leadership"'}
        </Button>
      </div>

      {status && (
        <p className={`text-sm ${status.tone === 'success' ? 'text-success-700' : 'text-danger-700'}`}>{status.text}</p>
      )}
    </div>
  );
}
