import { useState } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';

interface LifeTab {
  icon: string;
  label: string;
  title: string;
  body: string;
  cta: string;
  img: string;
}

interface Props {
  // hp_life_tabs, already parsed from the school_settings JSON string
  // (and defaulted to window._HP_LIFE_DEFAULTS's 5 tabs, index.html
  // ~line 18138) server-side before this island is mounted.
  initialTabs: LifeTab[];
}

// Same signed-upload dance as ApartCardsEditor/LeadershipCardsEditor —
// ports uploadToCloudinary() (index.html ~line 16225).
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

export default function LifeTabsEditor({ initialTabs }: Props) {
  const [tabs, setTabs] = useState<LifeTab[]>(initialTabs);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  function updateTab(i: number, patch: Partial<LifeTab>) {
    setTabs((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }

  async function handleUpload(i: number, file: File) {
    setUploadingIdx(i);
    setStatus(null);
    try {
      const url = await uploadToCloudinary(file, 'vis/homepage/life');
      updateTab(i, { img: url });
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
        body: JSON.stringify({ life_tabs: tabs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Save failed.');
      setStatus({ tone: 'success', text: '"Life at VIS" tabs saved.' });
    } catch (e) {
      setStatus({ tone: 'danger', text: e instanceof Error ? e.message : 'Save failed.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-brand-brown-light">
        Edit the 5 student life tabs shown on the homepage. Tab count is fixed to match the public page layout.
      </p>

      {tabs.map((t, i) => (
        <div key={i} className="border border-brand-cream-dark rounded-lg p-4 bg-brand-cream flex flex-col gap-3">
          <span className="font-heading font-bold text-brand-brown-dark text-sm">
            Tab {i + 1} of {tabs.length}
          </span>

          <div className="flex gap-3">
            <Input
              id={`life-icon-${i}`}
              label="Icon"
              value={t.icon}
              onChange={(e) => updateTab(i, { icon: e.target.value })}
              placeholder="⚽"
              className="w-20"
            />
            <div className="flex-1">
              <Input
                id={`life-label-${i}`}
                label="Tab Label"
                value={t.label}
                onChange={(e) => updateTab(i, { label: e.target.value })}
                placeholder="Athletics & Sports"
              />
            </div>
          </div>

          <Input
            id={`life-title-${i}`}
            label="Panel Heading"
            value={t.title}
            onChange={(e) => updateTab(i, { title: e.target.value })}
            placeholder="Athletics & Sports"
          />

          <div className="flex flex-col gap-1">
            <label htmlFor={`life-body-${i}`} className="text-sm font-medium text-brand-brown-dark">
              Body Text
            </label>
            <textarea
              id={`life-body-${i}`}
              rows={3}
              value={t.body}
              onChange={(e) => updateTab(i, { body: e.target.value })}
              placeholder="Describe this programme…"
              className="font-body text-sm rounded-sm border border-brand-cream-dark px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold"
            />
          </div>

          <Input
            id={`life-cta-${i}`}
            label="CTA Button Label"
            value={t.cta}
            onChange={(e) => updateTab(i, { cta: e.target.value })}
            placeholder="Join a Team"
          />

          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-brand-brown-dark">Image</span>
            <div className="flex items-center gap-3 flex-wrap">
              {t.img ? (
                <img src={t.img} alt="" className="object-cover rounded-md border border-brand-cream-dark" style={{ height: 52, width: 80 }} />
              ) : (
                <div
                  className="rounded-md border-2 border-dashed border-brand-brown-light flex items-center justify-center text-xl"
                  style={{ height: 52, width: 80 }}
                >
                  {t.icon || '🖼️'}
                </div>
              )}
              <label className="text-xs font-medium px-3 py-1.5 rounded-sm border border-brand-cream-dark bg-white cursor-pointer hover:bg-brand-cream">
                {uploadingIdx === i ? 'Uploading…' : 'Upload Image'}
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
              {t.img && (
                <button type="button" onClick={() => updateTab(i, { img: '' })} className="text-danger-700 text-xs hover:underline">
                  Remove image
                </button>
              )}
              {!t.img && <span className="text-xs text-brand-brown-light">No image — falls back to emoji placeholder</span>}
            </div>
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3 pt-2">
        <Button type="button" variant="gold" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save "Life at VIS" Tabs'}
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
