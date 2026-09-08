import { useState } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';

interface SignatoryData {
  name: string;
  role: string;
  signature: string;
  stamp: string;
}

interface Props {
  initialAdmission: SignatoryData;
  initialFinance: SignatoryData;
}

async function uploadToCloudinary(file: File): Promise<string> {
  const signRes = await fetch('/api/admin/settings/sign-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder: 'vis/school' }),
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

  const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloud_name}/image/upload`, { method: 'POST', body: fd });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.secure_url as string;
}

function SignatoryBlock({
  title, banner, data, onChange,
}: {
  title: string;
  banner: string;
  data: SignatoryData;
  onChange: (patch: Partial<SignatoryData>) => void;
}) {
  const [uploading, setUploading] = useState<'signature' | 'stamp' | null>(null);

  async function handleUpload(kind: 'signature' | 'stamp', file: File) {
    setUploading(kind);
    try {
      const url = await uploadToCloudinary(file);
      onChange({ [kind]: url } as Partial<SignatoryData>);
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="bg-white border border-brand-cream-dark rounded-lg p-5 flex flex-col gap-4">
      <div className="font-heading font-bold text-brand-brown-dark text-sm">{title}</div>
      <div className="text-xs rounded-md p-2.5 bg-brand-cream text-brand-brown-light">{banner}</div>
      <div className="grid grid-cols-2 gap-4">
        <Input id={`${title}-name`} label="Signatory Full Name" value={data.name} onChange={(e) => onChange({ name: e.target.value })} />
        <Input id={`${title}-role`} label="Title / Role" value={data.role} onChange={(e) => onChange({ role: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {(['signature', 'stamp'] as const).map((kind) => (
          <div key={kind} className="flex flex-col gap-1">
            <span className="text-sm font-medium text-brand-brown-dark">
              {kind === 'signature' ? 'Signature' : 'Official Stamp / Seal'}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {data[kind] ? (
                <img src={data[kind]} alt="" className="h-11 object-contain border border-brand-cream-dark rounded-md p-0.5" />
              ) : (
                <div className="h-11 w-14 border-2 border-dashed border-brand-brown-light rounded-md flex items-center justify-center text-base">
                  {kind === 'signature' ? '✍️' : '🔏'}
                </div>
              )}
              <label className="text-xs font-medium px-2.5 py-1.5 rounded-sm border border-brand-cream-dark bg-white cursor-pointer hover:bg-brand-cream">
                {uploading === kind ? 'Uploading…' : 'Upload'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading !== null}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(kind, file);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SignatoriesEditor({ initialAdmission, initialFinance }: Props) {
  const [admission, setAdmission] = useState<SignatoryData>(initialAdmission);
  const [finance, setFinance] = useState<SignatoryData>(initialFinance);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch('/api/admin/settings/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            admission_signatory_name: admission.name,
            admission_signatory_role: admission.role,
            admission_signatory_signature: admission.signature,
            admission_signatory_stamp: admission.stamp,
            finance_signatory_name: finance.name,
            finance_signatory_role: finance.role,
            finance_signatory_signature: finance.signature,
            finance_signatory_stamp: finance.stamp,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Save failed.');
      setStatus({ tone: 'success', text: 'Signatories saved.' });
    } catch (e) {
      setStatus({ tone: 'danger', text: e instanceof Error ? e.message : 'Save failed.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-brand-brown-light">
        The "Classes Section" tab (per-class teacher/head-teacher signatures) isn't built yet — it
        lives in a separate <code>class_signatures</code> table in the old app, not here. This covers
        just the two school-wide signatories below.
      </p>
      <SignatoryBlock
        title="Admission Documents"
        banner="Appears on Admission Letters and Admission Documents."
        data={admission}
        onChange={(p) => setAdmission((prev) => ({ ...prev, ...p }))}
      />
      <SignatoryBlock
        title="School Fees & Finance"
        banner="Appears on School Fee Invoices and Receipts."
        data={finance}
        onChange={(p) => setFinance((prev) => ({ ...prev, ...p }))}
      />
      <div className="flex items-center gap-3">
        <Button type="button" variant="gold" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Signatories'}
        </Button>
      </div>
      {status && (
        <p className={`text-sm ${status.tone === 'success' ? 'text-success-700' : 'text-danger-700'}`}>{status.text}</p>
      )}
    </div>
  );
}
