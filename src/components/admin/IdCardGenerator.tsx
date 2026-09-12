import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';

interface Student {
  id: string;
  full_name?: string;
  admission_no?: string;
  class_id?: string;
}

interface IdCardGeneratorProps {
  students: Student[];
}

// FIX: the previous version loaded QRCode.js/JsBarcode from cdnjs at
// runtime via injected <script> tags — that's what produced "Could not
// load QR/barcode libraries from cdnjs" in production (cdnjs
// unreachable/blocked from this deployment). `qrcode` is already an
// npm dependency (used elsewhere in this repo); `jsbarcode` needs
// adding to package.json (see note in the delivered zip). Both are now
// real ES imports bundled at build time -- nothing fetched from a CDN
// at runtime, so this can't fail the way the old version did.
//
// face-api.js face-match-to-photo is still NOT included here -- that
// would need the same proctoring-grade model loading FaceCheckGate.tsx
// already does, a much bigger lift than a card layout, left for a
// dedicated follow-up.
export default function IdCardGenerator({ students }: IdCardGeneratorProps) {
  const [selectedId, setSelectedId] = useState(students[0]?.id ?? '');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const barcodeRef = useRef<SVGSVGElement>(null);

  const student = students.find((s) => s.id === selectedId);

  useEffect(() => {
    if (!student) return;
    setError(null);

    if (qrCanvasRef.current) {
      QRCode.toCanvas(qrCanvasRef.current, student.admission_no || student.id, { width: 96, margin: 1 }).catch(
        () => setError('Could not generate QR code.')
      );
    }
    if (barcodeRef.current) {
      try {
        JsBarcode(barcodeRef.current, student.admission_no || student.id, {
          format: 'CODE128',
          height: 30,
          displayValue: false,
        });
      } catch {
        // admission_no may contain characters CODE128 can't encode -- non-fatal
      }
    }
  }, [student]);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !student) return;
    setUploading(true);
    setError(null);
    try {
      const signRes = await fetch('/api/admin/id-cards/sign-photo-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: student.id }),
      });
      const sign = await signRes.json();
      if (!signRes.ok) {
        setError(sign.error || 'Could not sign upload.');
        return;
      }
      const form = new FormData();
      form.append('file', file);
      form.append('api_key', sign.api_key);
      form.append('timestamp', String(sign.timestamp));
      form.append('signature', sign.signature);
      form.append('folder', sign.folder);
      form.append('public_id', sign.public_id);
      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${sign.cloud_name}/image/upload`, {
        method: 'POST',
        body: form,
      });
      const uploaded = await uploadRes.json();
      if (!uploadRes.ok) {
        setError(uploaded.error?.message || 'Cloudinary upload failed.');
        return;
      }
      setPhotoUrl(uploaded.secure_url);
    } catch {
      setError('Network error during upload.');
    } finally {
      setUploading(false);
    }
  }

  if (!student) return <p className="text-sm text-brand-brown-light">No students loaded.</p>;

  return (
    <div className="flex flex-wrap gap-6">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col text-xs">
          <span className="font-heading font-semibold mb-1">Student</span>
          <select
            value={selectedId}
            onChange={(e) => { setSelectedId(e.target.value); setPhotoUrl(null); }}
            className="border border-brand-cream-dark rounded px-2 py-1 text-sm"
          >
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name || s.id}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs">
          <span className="font-heading font-semibold mb-1">Photo</span>
          <input type="file" accept="image/*" onChange={handlePhotoChange} disabled={uploading} />
        </label>
        {uploading && <p className="text-xs text-brand-brown-light">Uploading…</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <div className="w-72 rounded-xl border-2 border-brand-gold bg-white p-4 shadow-sm">
        <p className="text-center font-heading font-bold text-sm text-brand-brown-dark mb-2">
          VIS Student ID
        </p>
        <div className="w-20 h-20 mx-auto rounded-full overflow-hidden bg-brand-cream border border-brand-cream-dark mb-2">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[10px] text-brand-brown-light">No photo</div>
          )}
        </div>
        <p className="text-center text-sm font-semibold text-brand-brown-dark">{student.full_name}</p>
        <p className="text-center text-xs text-brand-brown-light mb-2">{student.class_id}</p>
        <div className="flex flex-col items-center gap-1">
          <canvas ref={qrCanvasRef} />
          <svg ref={barcodeRef} />
        </div>
      </div>
    </div>
  );
}
