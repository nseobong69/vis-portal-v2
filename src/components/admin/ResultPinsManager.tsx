import { useState } from 'react';
import { jsPDF } from 'jspdf';
import Button from '../ui/Button';
import { rpBuildPrefix, rpFullPin, rpGenSuffix, fmtStuName, secureCode } from '../../lib/resultPins';
import { ensureNairaFont, type SchoolSettingsForPdf } from '../../lib/pdf/feePdf';

interface ClassOption { id: string; name: string; arm?: string }
interface StudentLite { id: string; full_name?: string; admission_number?: string | null }
interface PinRow { student_id: string; pin: string; is_override: boolean }
interface ExamOption { id: string; title: string; class_name?: string; status?: string }
interface AptCode { id: string; code: string; class_name?: string; status: string; used_by_name?: string; used_at?: string }

interface Props {
  classes: ClassOption[];
  schoolSettings: SchoolSettingsForPdf;
  aptitudeExams: ExamOption[];
  aptitudeCodes: AptCode[];
  cbtExams: ExamOption[];
}

const SESSIONS = ['2024/2025', '2025/2026', '2026/2027', '2027/2028', '2028/2029'];
const TERMS = ['1st Term', '2nd Term', '3rd Term'];

export default function ResultPinsManager({ classes, schoolSettings, aptitudeExams, aptitudeCodes, cbtExams }: Props) {
  const [tab, setTab] = useState<'pins' | 'aptitude' | 'cbt'>('pins');
  const [aptCodes, setAptCodes] = useState<AptCode[]>(aptitudeCodes);
  const [aptClass, setAptClass] = useState('');
  const [aptExam, setAptExam] = useState('');
  const [aptCount, setAptCount] = useState(10);
  const [aptBusy, setAptBusy] = useState(false);
  const [aptError, setAptError] = useState('');

  const [cbtExamList, setCbtExamList] = useState<any[]>(cbtExams);
  const [wClass, setWClass] = useState('');
  const [wExam, setWExam] = useState('');
  const [wCount, setWCount] = useState(1);
  const [wBusy, setWBusy] = useState(false);
  const [wCodes, setWCodes] = useState<string[]>([]);
  const [wError, setWError] = useState('');

  const [cid, setCid] = useState('');
  const [term, setTerm] = useState('1st Term');
  const [sess, setSess] = useState('2025/2026');
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [pinMap, setPinMap] = useState<Record<string, PinRow>>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [overriding, setOverriding] = useState<string | null>(null);
  const [overrideVal, setOverrideVal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const selClass = classes.find((c) => c.id === cid);
  const className = selClass ? `${selClass.name}${selClass.arm ? ' ' + selClass.arm : ''}` : '';
  const prefix = className ? rpBuildPrefix(className, sess, term) : '';

  async function load(newCid?: string, newTerm?: string, newSess?: string) {
    const useCid = newCid ?? cid, useTerm = newTerm ?? term, useSess = newSess ?? sess;
    if (!useCid) { setStudents([]); setPinMap({}); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/result-pins/load?class_id=${useCid}&term=${encodeURIComponent(useTerm)}&session=${encodeURIComponent(useSess)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load.');
      setStudents(data.students || []);
      const map: Record<string, PinRow> = {};
      (data.pins || []).forEach((p: PinRow) => { map[p.student_id] = p; });
      setPinMap(map);
      setChecked(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function saveOne(s: StudentLite, pin: string, isOverride: boolean) {
    const res = await fetch('/api/admin/result-pins/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ctx: { cid, className, term, sess },
        students: [s],
        pins: { [s.id]: { pin, isOverride } },
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Save failed.');
    setPinMap((prev) => ({ ...prev, [s.id]: { student_id: s.id, pin, is_override: isOverride } }));
  }

  async function generateOne(s: StudentLite) {
    setError('');
    try {
      const pin = rpFullPin(className, sess, term, rpGenSuffix());
      await saveOne(s, pin, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed.');
    }
  }

  async function generateSelected() {
    if (!checked.size) { setError('Select at least one student (or use Select All).'); return; }
    setBusy(true);
    setError('');
    try {
      const targets = students.filter((s) => checked.has(s.id));
      const pins: Record<string, { pin: string; isOverride: boolean }> = {};
      targets.forEach((s) => { pins[s.id] = { pin: rpFullPin(className, sess, term, rpGenSuffix()), isOverride: false }; });
      const res = await fetch('/api/admin/result-pins/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ctx: { cid, className, term, sess }, students: targets, pins }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed.');
      setPinMap((prev) => {
        const next = { ...prev };
        targets.forEach((s) => { next[s.id] = { student_id: s.id, pin: pins[s.id].pin, is_override: false }; });
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed.');
    } finally {
      setBusy(false);
    }
  }

  function startOverride(s: StudentLite) {
    const current = (pinMap[s.id]?.pin || '').split('/').pop() || '';
    setOverriding(s.id);
    setOverrideVal(current);
  }

  async function saveOverride(s: StudentLite) {
    const suffix = overrideVal.trim();
    if (suffix.length !== 6) { setError('The code must be exactly 6 characters.'); return; }
    try {
      const pin = rpFullPin(className, sess, term, suffix);
      await saveOne(s, pin, true);
      setOverriding(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed.');
    }
  }

  function copyPin(pin: string) {
    navigator.clipboard?.writeText(pin);
    setCopied(pin);
    setTimeout(() => setCopied(null), 1500);
  }

  // Ported from rpDownloadSheet() (index.html ~L24458-24483) — reuses
  // the same embedded Naira font as the Fee Receipts PDFs.
  function downloadSheet() {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    ensureNairaFont(pdf);
    const W = 210;
    pdf.setFillColor(93, 64, 55); pdf.rect(0, 0, W, 26, 'F');
    pdf.setFillColor(201, 162, 75); pdf.rect(0, 26, W, 1, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFontSize(12); pdf.setFont('DejaVuSans', 'bold');
    pdf.text(schoolSettings.school_name || 'School', W / 2, 11, { align: 'center' });
    pdf.setFontSize(7.5); pdf.setFont('DejaVuSans', 'normal');
    pdf.text('', W / 2, 17, { align: 'center' });
    pdf.setTextColor(0, 0, 0); pdf.setFontSize(11); pdf.setFont('DejaVuSans', 'bold');
    pdf.text(`Result PIN Sheet — ${className} (${term}, ${sess})`, W / 2, 36, { align: 'center' });
    pdf.setLineWidth(0.4); pdf.setDrawColor(93, 64, 55); pdf.line(14, 40, W - 14, 40);
    pdf.setFontSize(8.5); pdf.setFont('DejaVuSans', 'normal');
    let y = 48;
    students.forEach((s, i) => {
      if (y > 274) { pdf.addPage(); y = 20; }
      const x = i % 2 === 0 ? 14 : 110;
      if (i % 2 === 0 && i > 0) y += 12;
      pdf.setFont('DejaVuSans', 'bold'); pdf.setTextColor(93, 64, 55);
      pdf.text(fmtStuName(s.full_name), x, y);
      pdf.setFont('DejaVuSans', 'normal'); pdf.setTextColor(0, 0, 0);
      pdf.text(`Adm: ${s.admission_number || '—'}`, x, y + 4.5);
      pdf.setFont('DejaVuSans', 'bold'); pdf.setTextColor(44, 24, 16);
      pdf.text(`PIN: ${pinMap[s.id]?.pin || 'NOT GENERATED'}`, x, y + 9);
    });
    pdf.save(`PINSheet_${className.replace(/\s+/g, '')}_${term.replace(/\s+/g, '')}_${sess.replace(/\//g, '-')}.pdf`);
  }

  const genCount = Object.keys(pinMap).length;

  // ── Aptitude Codes ──
  async function generateAptCodes() {
    setAptError('');
    if (!aptClass || !aptExam) { setAptError('Select class and aptitude test.'); return; }
    setAptBusy(true);
    try {
      const cls = classes.find((c) => c.id === aptClass);
      const className = cls ? `${cls.name}${cls.arm ? ' ' + cls.arm : ''}` : '';
      const codes = Array.from({ length: aptCount }, () => secureCode(10));
      const res = await fetch('/api/admin/aptitude-codes/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', class_id: aptClass, class_name: className, exam_id: aptExam, codes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed.');
      setAptCodes((prev) => [...codes.map((code) => ({ id: `tmp-${code}`, code, class_name: className, status: 'active' })), ...prev]);
    } catch (e) {
      setAptError(e instanceof Error ? e.message : 'Failed.');
    } finally {
      setAptBusy(false);
    }
  }

  async function deleteAptCode(id: string) {
    if (!confirm('Delete this code?')) return;
    await fetch('/api/admin/aptitude-codes/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    });
    setAptCodes((prev) => prev.filter((c) => c.id !== id));
  }

  function exportAptCodes() {
    const active = aptCodes.filter((c) => c.status === 'active');
    const lines = ['Code,Class', ...active.map((c) => `${c.code},${c.class_name || ''}`)];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'aptitude_codes.csv';
    a.click();
  }

  // ── CBT Walk-in Codes ──
  async function generateWalkinCodes() {
    setWError('');
    if (!wClass.trim()) { setWError('Enter the class for these codes.'); return; }
    if (!wExam) { setWError('Select a linked exam.'); return; }
    if (wCount < 1 || wCount > 200) { setWError('Count must be between 1 and 200.'); return; }
    const exam = cbtExamList.find((e) => e.id === wExam);
    if (exam?.class_name && exam.class_name.trim().toLowerCase() !== wClass.trim().toLowerCase()) {
      setWError(`⚠️ The selected exam is for class "${exam.class_name}". Your class "${wClass}" doesn't match.`);
      return;
    }
    setWBusy(true);
    try {
      const codes = Array.from({ length: wCount }, () => secureCode(8));
      const res = await fetch('/api/admin/cbt-codes/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate_walkin', class_name: wClass, exam_id: wExam, codes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed.');
      setWCodes(codes);
    } catch (e) {
      setWError(e instanceof Error ? e.message : 'Failed.');
    } finally {
      setWBusy(false);
    }
  }

  function copyAllWalkinCodes() {
    navigator.clipboard?.writeText(wCodes.join('\n'));
  }

  async function regenCBTCode(examId: string) {
    const code = secureCode(8);
    const res = await fetch('/api/admin/cbt-codes/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'regenerate', exam_id_regen: examId, new_code: code }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data?.error || 'Failed.'); return; }
    setCbtExamList((prev) => prev.map((e) => (e.id === examId ? { ...e, access_code: code } : e)));
  }

  function copyText(t: string) {
    navigator.clipboard?.writeText(t);
  }


  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 bg-brand-cream rounded-lg p-1 max-w-fit flex-wrap">
        <button onClick={() => setTab('pins')} className={`text-sm px-4 py-2 rounded-md font-medium ${tab === 'pins' ? 'bg-brand-gold text-shell-obsidian' : 'text-brand-brown-light'}`}>🔑 Result PINs</button>
        <button onClick={() => setTab('aptitude')} className={`text-sm px-4 py-2 rounded-md font-medium ${tab === 'aptitude' ? 'bg-brand-gold text-shell-obsidian' : 'text-brand-brown-light'}`}>🎓 Aptitude Codes</button>
        <button onClick={() => setTab('cbt')} className={`text-sm px-4 py-2 rounded-md font-medium ${tab === 'cbt' ? 'bg-brand-gold text-shell-obsidian' : 'text-brand-brown-light'}`}>💻 CBT Access Codes</button>
      </div>

      {tab === 'aptitude' && (
        <>
          <div className="bg-white rounded-lg border border-brand-cream-dark p-5">
            <h3 className="font-heading font-bold text-sm text-brand-brown-dark mb-3">✨ Generate Aptitude Codes</h3>
            <div className="flex gap-3 flex-wrap items-end">
              <div className="flex flex-col gap-1 flex-1 min-w-[170px]">
                <label className="text-xs font-medium text-brand-brown-dark">Class</label>
                <select value={aptClass} onChange={(e) => setAptClass(e.target.value)} className="text-sm rounded-sm border border-brand-cream-dark px-3 py-2">
                  <option value="">Select Class</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}{c.arm ? ' ' + c.arm : ''}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1 flex-1 min-w-[170px]">
                <label className="text-xs font-medium text-brand-brown-dark">Linked Aptitude Test</label>
                <select value={aptExam} onChange={(e) => setAptExam(e.target.value)} className="text-sm rounded-sm border border-brand-cream-dark px-3 py-2">
                  <option value="">Select Aptitude Test</option>
                  {aptitudeExams.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1 w-[110px]">
                <label className="text-xs font-medium text-brand-brown-dark">Count</label>
                <input type="number" min={1} max={200} value={aptCount} onChange={(e) => setAptCount(+e.target.value)} className="text-sm rounded-sm border border-brand-cream-dark px-3 py-2" />
              </div>
              <Button type="button" variant="gold" onClick={generateAptCodes} disabled={aptBusy}>✨ Generate</Button>
            </div>
            {aptError && <p className="text-sm text-danger-700 mt-2">{aptError}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div className="bg-white rounded-lg border border-brand-cream-dark overflow-hidden">
              <div className="px-4 py-3 border-b border-brand-cream-dark flex justify-between items-center">
                <span className="font-bold text-sm text-brand-brown-dark">Active Codes ({aptCodes.filter((c) => c.status === 'active').length})</span>
                <button onClick={exportAptCodes} className="text-xs px-2.5 py-1.5 rounded-sm border border-brand-cream-dark hover:bg-brand-cream">⬇️ Export</button>
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                {aptCodes.filter((c) => c.status === 'active').length === 0 && (
                  <div className="p-6 text-center text-brand-brown-light text-sm">No active codes.</div>
                )}
                {aptCodes.filter((c) => c.status === 'active').map((c) => (
                  <div key={c.id} className="px-4 py-2.5 border-b border-brand-cream-dark last:border-0 flex justify-between items-center">
                    <div>
                      <span onClick={() => copyText(c.code)} className="font-mono text-sm font-bold tracking-wide text-brand-brown-dark cursor-pointer" title="Click to copy">{c.code}</span>
                      <div className="text-[11px] text-brand-brown-light">{c.class_name || '—'}</div>
                    </div>
                    <button onClick={() => deleteAptCode(c.id)} className="text-xs px-2 py-1 rounded-sm bg-danger-700 text-white">🗑️</button>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-lg border border-brand-cream-dark overflow-hidden">
              <div className="px-4 py-3 border-b border-brand-cream-dark">
                <span className="font-bold text-sm text-brand-brown-light">Used Codes ({aptCodes.filter((c) => c.status === 'used').length})</span>
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                {aptCodes.filter((c) => c.status === 'used').length === 0 && (
                  <div className="p-6 text-center text-brand-brown-light text-sm">No used codes yet.</div>
                )}
                {aptCodes.filter((c) => c.status === 'used').map((c) => (
                  <div key={c.id} className="px-4 py-2.5 border-b border-brand-cream-dark last:border-0">
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-xs text-brand-brown-light line-through">{c.code}</span>
                      <span className="text-[10px] rounded-full px-1.5 py-0.5 bg-brand-brown-dark text-white">USED</span>
                    </div>
                    <div className="text-[11px] text-brand-brown-light">{c.used_by_name || '—'} · {c.class_name || '—'} · {c.used_at ? new Date(c.used_at).toLocaleDateString('en-GB') : '—'}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'cbt' && (
        <>
          <div className="bg-white rounded-lg border border-brand-cream-dark p-5">
            <h3 className="font-heading font-bold text-sm text-brand-brown-dark mb-3">➕ Generate Walk-in CBT Access Codes</h3>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-brand-brown-dark">Class</label>
                  <input value={wClass} onChange={(e) => setWClass(e.target.value)} placeholder="e.g. JSS 1" className="text-sm rounded-sm border border-brand-cream-dark px-3 py-2" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-brand-brown-dark">Linked CBT Exam</label>
                  <select value={wExam} onChange={(e) => setWExam(e.target.value)} className="text-sm rounded-sm border border-brand-cream-dark px-3 py-2">
                    <option value="">Select Exam</option>
                    {cbtExamList.filter((e) => e.status === 'active' || e.status === 'draft').map((e) => (
                      <option key={e.id} value={e.id}>{e.title} ({e.class_name || 'All'})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-brand-brown-dark">Number of Codes to Generate</label>
                <input type="number" min={1} max={200} value={wCount} onChange={(e) => setWCount(+e.target.value)} className="text-sm rounded-sm border border-brand-cream-dark px-3 py-2 max-w-[160px]" />
              </div>
              <Button type="button" variant="gold" onClick={generateWalkinCodes} disabled={wBusy}>🔑 Generate Codes</Button>
            </div>
            {wError && <p className="text-sm text-danger-700 mt-2">{wError}</p>}
            {wCodes.length > 0 && (
              <div className="mt-4 bg-success-700/10 rounded-lg p-4">
                <div className="text-xs font-bold text-success-700 mb-2.5">Generated Access Codes</div>
                <div className="flex flex-wrap gap-2">
                  {wCodes.map((c) => (
                    <code key={c} className="bg-white border border-emerald-300 rounded-md px-2.5 py-1 text-sm font-bold tracking-wide text-success-700">{c}</code>
                  ))}
                </div>
                <button onClick={copyAllWalkinCodes} className="mt-2.5 text-xs px-3 py-1.5 rounded-sm bg-success-700 text-white">📋 Copy All Codes</button>
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg border border-brand-cream-dark overflow-hidden">
            <div className="px-4 py-3 border-b border-brand-cream-dark font-bold text-sm text-brand-brown-dark">📋 All CBT Exam Access Codes</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-brand-brown-light border-b border-brand-cream-dark">
                    <th className="px-4 py-2">Exam</th><th className="px-4 py-2">Class</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Access Code</th><th className="px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cbtExamList.length === 0 && <tr><td colSpan={5} className="text-center py-7 text-brand-brown-light">No CBT exams found.</td></tr>}
                  {cbtExamList.map((e) => (
                    <tr key={e.id} className="border-b border-brand-cream-dark last:border-0">
                      <td className="px-4 py-2 font-semibold">{e.title}</td>
                      <td className="px-4 py-2"><span className="text-[10.5px] rounded-full px-1.5 py-0.5 bg-brand-cream">{e.class_name || 'All'}</span></td>
                      <td className="px-4 py-2"><span className="text-[10.5px] rounded-full px-1.5 py-0.5 bg-brand-cream uppercase">{e.status || 'draft'}</span></td>
                      <td className="px-4 py-2"><code className="bg-brand-cream px-2 py-1 rounded-sm text-xs font-bold tracking-wide">{e.access_code || '—'}</code></td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1.5">
                          <button onClick={() => regenCBTCode(e.id)} className="text-xs px-2 py-1 rounded-sm border border-brand-cream-dark hover:bg-brand-cream" title="Regenerate">🔄</button>
                          {e.access_code && <button onClick={() => copyText(e.access_code)} className="text-xs px-2 py-1 rounded-sm border border-brand-cream-dark hover:bg-brand-cream" title="Copy">📋</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'pins' && (
        <>
          <div className="bg-white rounded-lg border border-brand-cream-dark p-5">
            <h3 className="font-heading font-bold text-sm text-brand-brown-dark mb-3">🔍 Select Class, Term &amp; Session</h3>
            <div className="flex gap-3 flex-wrap items-end">
              <div className="flex flex-col gap-1 flex-1 min-w-[170px]">
                <label className="text-xs font-medium text-brand-brown-dark">Class</label>
                <select value={cid} onChange={(e) => { setCid(e.target.value); load(e.target.value, term, sess); }} className="text-sm rounded-sm border border-brand-cream-dark px-3 py-2">
                  <option value="">Select Class</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}{c.arm ? ' ' + c.arm : ''}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
                <label className="text-xs font-medium text-brand-brown-dark">Term</label>
                <select value={term} onChange={(e) => { setTerm(e.target.value); load(cid, e.target.value, sess); }} className="text-sm rounded-sm border border-brand-cream-dark px-3 py-2">
                  {TERMS.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1 flex-1 min-w-[150px]">
                <label className="text-xs font-medium text-brand-brown-dark">Session</label>
                <select value={sess} onChange={(e) => { setSess(e.target.value); load(cid, term, e.target.value); }} className="text-sm rounded-sm border border-brand-cream-dark px-3 py-2">
                  {SESSIONS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-danger-700">{error}</p>}

          {loading && <div className="text-center py-8 text-brand-brown-light">Loading…</div>}

          {!loading && cid && (
            <>
              <div className="bg-white rounded-lg border border-brand-cream-dark p-4 flex justify-between items-center flex-wrap gap-2.5">
                <div>
                  <span className="font-bold text-sm text-brand-brown-dark">🔑 {className} — {term}, {sess}</span>
                  <span className="ml-2 text-[11px] rounded-full px-2 py-0.5 bg-brand-cream">{genCount} / {students.length} generated</span>
                  <div className="text-[11px] text-brand-brown-light mt-1">
                    PIN format: <code className="bg-brand-cream px-1.5 py-0.5 rounded-sm">{prefix}/XXXXXX</code> (case-sensitive)
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap items-center">
                  <label className="flex items-center gap-1.5 text-xs text-brand-brown-light cursor-pointer">
                    <input type="checkbox" onChange={(e) => setChecked(e.target.checked ? new Set(students.map((s) => s.id)) : new Set())} /> Select All
                  </label>
                  <Button type="button" variant="gold" onClick={generateSelected} disabled={busy}>✨ Auto-Generate (Selected)</Button>
                  <Button type="button" variant="secondary" onClick={downloadSheet}>⬇️ Download PIN Sheet</Button>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-brand-cream-dark overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-brand-brown-light border-b border-brand-cream-dark">
                      <th className="px-3 py-2"></th><th className="px-3 py-2">#</th><th className="px-3 py-2">Student</th>
                      <th className="px-3 py-2">Adm No</th><th className="px-3 py-2">PIN</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.length === 0 && <tr><td colSpan={7} className="text-center py-7 text-brand-brown-light">No students in this class.</td></tr>}
                    {students.map((s, i) => {
                      const p = pinMap[s.id];
                      return (
                        <tr key={s.id} className="border-b border-brand-cream-dark last:border-0">
                          <td className="px-3 py-2"><input type="checkbox" checked={checked.has(s.id)} onChange={() => toggle(s.id)} /></td>
                          <td className="px-3 py-2 text-brand-brown-light">{i + 1}</td>
                          <td className="px-3 py-2 font-semibold">{fmtStuName(s.full_name)}</td>
                          <td className="px-3 py-2 text-xs text-brand-brown-light">{s.admission_number || '—'}</td>
                          <td className="px-3 py-2">
                            {overriding === s.id ? (
                              <div className="flex items-center gap-1.5">
                                <code className="text-[11px] text-brand-brown-light bg-brand-cream px-1.5 py-1 rounded-sm">{prefix}/</code>
                                <input value={overrideVal} onChange={(e) => setOverrideVal(e.target.value)} maxLength={6} className="w-20 text-xs font-bold rounded-sm border border-brand-cream-dark px-2 py-1" />
                                <button onClick={() => saveOverride(s)} className="text-xs px-2 py-1 rounded-sm bg-success-700 text-white">✓</button>
                                <button onClick={() => setOverriding(null)} className="text-xs px-2 py-1 rounded-sm border border-brand-cream-dark">✕</button>
                              </div>
                            ) : p ? (
                              <code className="bg-brand-cream px-2 py-1 rounded-sm text-xs font-bold">{p.pin}</code>
                            ) : <span className="text-brand-brown-light">—</span>}
                          </td>
                          <td className="px-3 py-2">
                            {p ? <span className="text-[10.5px] rounded-full px-1.5 py-0.5 bg-success-700/10 text-success-700">Generated{p.is_override ? ' (override)' : ''}</span>
                              : <span className="text-[10.5px] rounded-full px-1.5 py-0.5 bg-brand-cream text-brand-brown-light">No PIN</span>}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1.5">
                              {p ? (
                                <>
                                  <button onClick={() => copyPin(p.pin)} className="text-xs px-2 py-1 rounded-sm border border-brand-cream-dark hover:bg-brand-cream">
                                    {copied === p.pin ? '✓' : '📋'}
                                  </button>
                                  <button onClick={() => startOverride(s)} className="text-xs px-2 py-1 rounded-sm border border-brand-cream-dark hover:bg-brand-cream">✏️</button>
                                </>
                              ) : (
                                <button onClick={() => generateOne(s)} className="text-xs px-2 py-1 rounded-sm bg-success-700 text-white">+ Generate</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
