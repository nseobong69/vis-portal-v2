import { useState } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import Button from '../ui/Button';
import {
  idcBuildFront, idcBuildBack, idcGenCodes, idcIdNumber, idcQrText, IDC_STYLES,
  type IdCardPerson, type IdCardType, type IdCardSchoolSettings,
} from '../../lib/idcard';

interface ClassOption { id: string; name: string; level?: string }

interface Props {
  classes: ClassOption[];
  staff: IdCardPerson[];
  schoolSettings: IdCardSchoolSettings;
}

function safeName(n: string) {
  return (n || 'card').replace(/[^a-zA-Z0-9_-]/g, '_');
}

export default function IdCardsManager({ classes, staff, schoolSettings }: Props) {
  const [tab, setTab] = useState<IdCardType>('students');
  const [selectedClass, setSelectedClass] = useState<ClassOption | null>(null);
  const [students, setStudents] = useState<IdCardPerson[] | null>(null);
  const [loadingClass, setLoadingClass] = useState(false);

  const [preview, setPreview] = useState<{ person: IdCardPerson; type: IdCardType; front: string; back: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [bulkTarget, setBulkTarget] = useState<{ people: IdCardPerson[]; type: IdCardType; label: string } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');

  async function selectClass(c: ClassOption) {
    setSelectedClass(c);
    setLoadingClass(true);
    setStudents(null);
    try {
      const res = await fetch(`/api/admin/id-cards/students?class_id=${encodeURIComponent(c.id)}`);
      const data = await res.json();
      setStudents(res.ok ? data.students || [] : []);
    } finally {
      setLoadingClass(false);
    }
  }

  async function openPreview(person: IdCardPerson, type: IdCardType) {
    const front = idcBuildFront(person, type, 'prev', schoolSettings);
    const idNum = idcIdNumber(person, type);
    const { qrUrl, barcodeUrl } = await idcGenCodes(idcQrText(idNum, type), idNum);
    const back = idcBuildBack(person, type, 'prev', qrUrl, barcodeUrl, schoolSettings);
    setPreview({ person, type, front, back });
  }

  async function downloadSingle() {
    if (!preview) return;
    setDownloading(true);
    try {
      const frontEl = document.getElementById('pvc-front-prev');
      const backEl = document.getElementById('pvc-back-prev');
      if (!frontEl || !backEl) return;

      const [frontCanvas, backCanvas] = await Promise.all([
        html2canvas(frontEl, { scale: 6, useCORS: true, backgroundColor: '#ffffff', logging: false }),
        html2canvas(backEl, { scale: 6, useCORS: true, backgroundColor: '#ffffff', logging: false }),
      ]);

      const CARD_W = 85.6, CARD_H = 54, GAP = 6, MARGIN = 5;
      const pageW = MARGIN + CARD_W + GAP + CARD_W + MARGIN;
      const pageH = MARGIN + CARD_H + MARGIN;

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [pageH, pageW] });
      pdf.addImage(frontCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN, MARGIN, CARD_W, CARD_H);
      pdf.addImage(backCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN + CARD_W + GAP, MARGIN, CARD_W, CARD_H);
      pdf.save(`ID_Card_${safeName(preview.person.full_name || 'card')}.pdf`);
    } finally {
      setDownloading(false);
    }
  }

  async function generateBulkPDF() {
    if (!bulkTarget || !bulkTarget.people.length) return;
    setBulkBusy(true);
    setBulkStatus('Preparing…');

    const stage = document.createElement('div');
    stage.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;pointer-events:none;background:#fff;';
    document.body.appendChild(stage);

    try {
      const PAGE_W = 210, PAGE_H = 297;
      const CARD_W = 85.6, CARD_H = 54, COLS = 2, ROWS = 4, GAP = 3;
      const gridW = COLS * CARD_W + (COLS - 1) * GAP;
      const gridH = ROWS * CARD_H + (ROWS - 1) * GAP;
      const MX = (PAGE_W - gridW) / 2;
      const MY = (PAGE_H - gridH) / 2;
      const PER_PAGE = COLS * ROWS;
      const SCALE = 4;

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const people = bulkTarget.people;
      const type = bulkTarget.type;
      const totalPages = Math.ceil(people.length / PER_PAGE);
      let firstPage = true;

      for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
        const chunk = people.slice(pageIdx * PER_PAGE, (pageIdx + 1) * PER_PAGE);
        if (!firstPage) pdf.addPage();
        firstPage = false;

        setBulkStatus(`Sheet ${pageIdx + 1} of ${totalPages} — fronts…`);
        for (let i = 0; i < chunk.length; i++) {
          const col = i % COLS, row = Math.floor(i / COLS);
          const x = MX + col * (CARD_W + GAP), y = MY + row * (CARD_H + GAP);
          stage.innerHTML = idcBuildFront(chunk[i], type, `bf_${pageIdx}_${i}`, schoolSettings);
          const el = stage.firstElementChild as HTMLElement | null;
          if (el) { el.style.borderRadius = '0'; el.style.boxShadow = 'none'; }
          const canvas = await html2canvas(el || stage, { scale: SCALE, useCORS: true, backgroundColor: '#ffffff', logging: false });
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', x, y, CARD_W, CARD_H);
        }

        pdf.addPage();
        setBulkStatus(`Sheet ${pageIdx + 1} of ${totalPages} — backs…`);
        for (let row = 0; row < ROWS; row++) {
          for (let col = 0; col < COLS; col++) {
            const srcCol = (COLS - 1) - col;
            const srcIdx = row * COLS + srcCol;
            if (srcIdx >= chunk.length) continue;
            const x = MX + col * (CARD_W + GAP), y = MY + row * (CARD_H + GAP);
            const bp = chunk[srcIdx];
            const idNum = idcIdNumber(bp, type);
            const { qrUrl, barcodeUrl } = await idcGenCodes(idcQrText(idNum, type), idNum);
            stage.innerHTML = idcBuildBack(bp, type, `bb_${pageIdx}_${srcIdx}`, qrUrl, barcodeUrl, schoolSettings);
            const el = stage.firstElementChild as HTMLElement | null;
            if (el) { el.style.borderRadius = '0'; el.style.boxShadow = 'none'; }
            const canvas = await html2canvas(el || stage, { scale: SCALE, useCORS: true, backgroundColor: '#ffffff', logging: false });
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', x, y, CARD_W, CARD_H);
          }
        }
      }

      pdf.save(`ID_Cards_Bulk_${safeName(bulkTarget.label)}_${new Date().toISOString().slice(0, 10)}.pdf`);
      setBulkStatus('✅ Downloaded.');
    } finally {
      stage.remove();
      setBulkBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <style dangerouslySetInnerHTML={{ __html: IDC_STYLES }} />

      <div className="flex gap-2.5 flex-wrap">
        <Button type="button" variant={tab === 'students' ? 'gold' : 'secondary'} onClick={() => setTab('students')}>
          🎓 Student ID Cards
        </Button>
        <Button type="button" variant={tab === 'staff' ? 'gold' : 'secondary'} onClick={() => setTab('staff')}>
          👔 Staff ID Cards
        </Button>
      </div>

      {tab === 'students' && (
        <>
          <div className="bg-white rounded-lg shadow-sm p-5">
            <h3 className="font-heading font-bold text-brand-brown-dark mb-1">📚 Select a Class</h3>
            <p className="text-xs text-brand-brown-light mb-4">Choose a class to view students and generate their ID cards.</p>
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {classes.map((c) => (
                <div
                  key={c.id}
                  className={`idc-class-card ${selectedClass?.id === c.id ? 'selected' : ''}`}
                  onClick={() => selectClass(c)}
                >
                  <div className="w-11 h-11 rounded-xl bg-brand-cream flex items-center justify-center shrink-0 text-lg">🏫</div>
                  <div>
                    <div className="font-bold text-sm text-brand-brown-dark">{c.name}</div>
                    <div className="text-xs text-brand-brown-light capitalize">{c.level || ''}</div>
                  </div>
                </div>
              ))}
              {!classes.length && <div className="text-brand-brown-light text-sm p-5">No classes found.</div>}
            </div>
          </div>

          {selectedClass && (
            <div className="bg-white rounded-lg shadow-sm p-5">
              {loadingClass ? (
                <div className="text-center py-10 text-brand-brown-light">Loading…</div>
              ) : (
                <>
                  <div className="flex justify-between items-center flex-wrap gap-2.5 mb-4">
                    <div>
                      <h3 className="font-heading font-bold text-brand-brown-dark">
                        👥 {selectedClass.name} — {students?.length || 0} Student{(students?.length || 0) !== 1 ? 's' : ''}
                      </h3>
                      <p className="text-xs text-brand-brown-light mt-1">Click Generate on a name for individual card, or use Bulk A4 for all.</p>
                    </div>
                    <Button
                      type="button" variant="gold"
                      onClick={() => students?.length && setBulkTarget({ people: students, type: 'students', label: selectedClass.name })}
                    >
                      🗂️ Bulk A4 ({students?.length || 0} cards · {Math.ceil((students?.length || 0) / 8)} sheet{Math.ceil((students?.length || 0) / 8) !== 1 ? 's' : ''})
                    </Button>
                  </div>
                  <div className="idc-list">
                    {(students || []).map((s, i) => (
                      <div key={s.id} className="idc-stu-row">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-6 text-center text-xs text-brand-brown-light font-bold shrink-0">{i + 1}</div>
                          {s.photo_url ? (
                            <img src={s.photo_url} className="idc-stu-avatar" alt="" />
                          ) : (
                            <div className="idc-stu-avatar flex items-center justify-center text-sm font-bold text-brand-brown-dark">
                              {(s.full_name || '?')[0]?.toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-brand-brown-dark truncate">{s.full_name || '—'}</div>
                            <div className="text-xs text-brand-brown-light">{s.admission_number || ''} · {s.gender || ''} · {s.session || schoolSettings.current_session || ''}</div>
                          </div>
                        </div>
                        <button onClick={() => openPreview(s, 'students')} className="text-xs px-3 py-1.5 rounded-sm border border-brand-cream-dark hover:bg-brand-cream shrink-0">
                          🪪 Generate
                        </button>
                      </div>
                    ))}
                    {!students?.length && <div className="p-5 text-brand-brown-light text-sm">No students in this class.</div>}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'staff' && (
        <div className="bg-white rounded-lg shadow-sm p-5">
          <div className="flex justify-between items-center flex-wrap gap-2.5 mb-4">
            <h3 className="font-heading font-bold text-brand-brown-dark">👔 Staff Members ({staff.length})</h3>
            <Button type="button" variant="gold" onClick={() => staff.length && setBulkTarget({ people: staff, type: 'staff', label: 'Staff' })}>
              🗂️ Bulk A4 — All Staff
            </Button>
          </div>
          <div className="idc-list">
            {staff.map((s) => (
              <div key={s.id} className="idc-stu-row">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {s.avatar_url ? (
                    <img src={s.avatar_url} className="idc-stu-avatar" alt="" />
                  ) : (
                    <div className="idc-stu-avatar flex items-center justify-center text-sm font-bold text-brand-brown-dark">
                      {(s.full_name || '?')[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-brand-brown-dark truncate">{s.full_name || '—'}</div>
                    <div className="text-xs text-brand-brown-light capitalize">{(s.role || 'staff').replace(/_/g, ' ')}</div>
                  </div>
                </div>
                <button onClick={() => openPreview(s, 'staff')} className="text-xs px-3 py-1.5 rounded-sm border border-brand-cream-dark hover:bg-brand-cream shrink-0">
                  🪪 Generate
                </button>
              </div>
            ))}
            {!staff.length && <div className="p-5 text-brand-brown-light text-sm">No staff records found.</div>}
          </div>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-8 px-4">
          <div className="bg-white rounded-lg max-w-[780px] w-full p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-xl text-brand-brown-dark">🪪 ID Card Preview</h3>
              <button onClick={() => setPreview(null)} className="text-2xl text-brand-brown-light leading-none">&times;</button>
            </div>
            <p className="text-xs text-brand-brown-light">{preview.person.full_name} · Standard PVC 85.6mm × 54mm</p>
            <div className="flex gap-4 flex-wrap justify-center overflow-x-auto">
              <div>
                <div className="text-[10px] font-bold text-brand-brown-light uppercase tracking-wide mb-2 text-center">FRONT</div>
                <div dangerouslySetInnerHTML={{ __html: preview.front }} />
              </div>
              <div>
                <div className="text-[10px] font-bold text-brand-brown-light uppercase tracking-wide mb-2 text-center">BACK</div>
                <div dangerouslySetInnerHTML={{ __html: preview.back }} />
              </div>
            </div>
            <p className="text-xs bg-emerald-50 text-emerald-800 rounded-md px-3 py-2.5">
              If no photo is shown, a box is reserved — it will sync automatically when a photo is added to the profile.
            </p>
            <div className="flex gap-2.5 justify-center">
              <Button type="button" variant="gold" onClick={downloadSingle} disabled={downloading}>
                {downloading ? 'Preparing…' : '⬇️ Download PDF'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setPreview(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {bulkTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-8 px-4">
          <div className="bg-white rounded-lg max-w-[540px] w-full p-6 flex flex-col gap-3.5">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-xl text-brand-brown-dark">🗂️ Bulk A4 ID Cards</h3>
              <button onClick={() => !bulkBusy && setBulkTarget(null)} className="text-2xl text-brand-brown-light leading-none">&times;</button>
            </div>
            <p className="text-sm bg-emerald-50 text-emerald-800 rounded-md px-3.5 py-3 leading-relaxed">
              <strong>{bulkTarget.people.length} ID card{bulkTarget.people.length !== 1 ? 's' : ''}</strong> across{' '}
              <strong>{Math.ceil(bulkTarget.people.length / 8)} A4 sheet{Math.ceil(bulkTarget.people.length / 8) !== 1 ? 's' : ''}</strong>
              {' '}· 8 cards per sheet (2 columns × 4 rows) · Each sheet has a front page and a back page
            </p>
            <p className="text-xs bg-amber-50 text-amber-800 rounded-md px-3.5 py-3 leading-relaxed">
              <strong>Print Tip:</strong> Use double-sided/duplex printing with "Flip on Long Edge". The back page is mirror-swapped
              per row so every card back aligns precisely behind its front. Cut along the gutters for PVC-ready cards.
            </p>
            {!bulkBusy && (
              <p className="text-xs bg-brand-cream text-brand-brown-light rounded-md px-3.5 py-3">
                Generation may take a while — please keep this tab open.
              </p>
            )}
            {bulkBusy && <p className="text-sm text-brand-brown-dark font-medium">{bulkStatus}</p>}
            <div className="flex gap-2.5 justify-center pt-1">
              {!bulkBusy && (
                <>
                  <Button type="button" variant="gold" onClick={generateBulkPDF}>📄 Generate &amp; Download PDF</Button>
                  <Button type="button" variant="secondary" onClick={() => setBulkTarget(null)}>Cancel</Button>
                </>
              )}
              {bulkBusy && bulkStatus.startsWith('✅') && (
                <Button type="button" variant="secondary" onClick={() => setBulkTarget(null)}>Close</Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
