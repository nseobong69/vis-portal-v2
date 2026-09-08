import { useState } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';

interface ApartCard {
  icon: string;
  title: string;
  body: string;
  cta: string;
  img: string;
  bg: string;
}

interface Props {
  // hp_apart_cards, already parsed from the school_settings JSON string
  // server-side before this island is mounted.
  initialCards: ApartCard[];
}

const BG_ROTATION = ['c1', 'c2', 'c3'];

// Ports uploadToCloudinary() (index.html ~line 16225): ask our own
// server for a signature (api/admin/settings/sign-upload.ts), then upload
// the file directly to Cloudinary. The API secret never touches the browser.
async function uploadToCloudinary(file: File, folder: string): Promise<string> {
  const signRes = await fetch('/api/admin/settings/sign-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder }),
  });
  const sig = await signRes.json();
  if (!signRes.ok || !sig?.signature) {
    throw new Error(sig?.error || 'Upload signing failed.');
  }

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

export default function ApartCardsEditor({ initialCards }: Props) {
  const [cards, setCards] = useState<ApartCard[]>(initialCards.length ? initialCards : []);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  function updateCard(i: number, patch: Partial<ApartCard>) {
    setCards((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  function addCard() {
    setCards((prev) => [
      ...prev,
      { icon: '⭐', title: '', body: '', cta: 'Learn more', img: '', bg: BG_ROTATION[prev.length % 3] },
    ]);
  }

  function removeCard(i: number) {
    setCards((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleUpload(i: number, file: File) {
    setUploadingIdx(i);
    setStatus(null);
    try {
      const url = await uploadToCloudinary(file, 'vis/homepage/apart');
      updateCard(i, { img: url });
      setStatus({ tone: 'success', text: 'Image uploaded.' });
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
        body: JSON.stringify({ apart_cards: cards }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Save failed.');
      setStatus({ tone: 'success', text: '"What Sets Us Apart" cards saved.' });
    } catch (e) {
      setStatus({ tone: 'danger', text: e instanceof Error ? e.message : 'Save failed.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {cards.length === 0 && (
        <p className="text-sm text-brand-brown-light">No cards yet. Click "Add Card" to add one.</p>
      )}

      {cards.map((c, i) => (
        <div key={i} className="border border-brand-cream-dark rounded-lg p-4 bg-brand-cream flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-heading font-bold text-brand-brown-dark text-sm">Card {i + 1}</span>
            <button
              type="button"
              onClick={() => removeCard(i)}
              className="text-danger-700 text-sm hover:underline"
            >
              Remove
            </button>
          </div>

          <Input
            id={`apart-icon-${i}`}
            label="Icon Emoji"
            value={c.icon}
            onChange={(e) => updateCard(i, { icon: e.target.value })}
            placeholder="e.g. 👥"
            className="w-20"
          />
          <Input
            id={`apart-title-${i}`}
            label="Title"
            value={c.title}
            onChange={(e) => updateCard(i, { title: e.target.value })}
            placeholder="Card heading"
          />
          <div className="flex flex-col gap-1">
            <label htmlFor={`apart-body-${i}`} className="text-sm font-medium text-brand-brown-dark">
              Description
            </label>
            <textarea
              id={`apart-body-${i}`}
              rows={3}
              value={c.body}
              onChange={(e) => updateCard(i, { body: e.target.value })}
              placeholder="Short description"
              className="font-body text-sm rounded-sm border border-brand-cream-dark px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold"
            />
          </div>
          <Input
            id={`apart-cta-${i}`}
            label="Button Label (optional)"
            value={c.cta}
            onChange={(e) => updateCard(i, { cta: e.target.value })}
            placeholder="e.g. Learn more"
          />

          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-brand-brown-dark">Card Image</span>
            <div className="flex items-center gap-3 flex-wrap">
              {c.img ? (
                <img src={c.img} alt="" className="h-13 w-20 object-cover rounded-md border border-brand-cream-dark" style={{ height: 52, width: 80 }} />
              ) : (
                <div
                  className="rounded-md border-2 border-dashed border-brand-brown-light flex items-center justify-center text-xl"
                  style={{ height: 52, width: 80 }}
                >
                  🖼️
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
              {c.img && (
                <button
                  type="button"
                  onClick={() => updateCard(i, { img: '' })}
                  className="text-danger-700 text-xs hover:underline"
                >
                  Remove image
                </button>
              )}
            </div>
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={addCard}>
          + Add Card
        </Button>
        <Button type="button" variant="gold" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save "What Sets Us Apart" Cards'}
        </Button>
      </div>

      {status && (
        <p className={`text-sm ${status.tone === 'success' ? 'text-success-700' : 'text-danger-700'}`}>
          {status.text}
        </p>
      )}
    </div>
  );
}
