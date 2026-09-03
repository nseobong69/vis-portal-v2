import { useEffect, useState } from 'react';
import Select from '../ui/Select';
import Button from '../ui/Button';
import Card from '../ui/Card';
import { useToast } from '../ui/Toast';
import {
  fetchScoreSheetSubjects,
  fetchScoreSheetPreview,
  fetchStaffName,
  type ClassOption,
  type SubjectOption,
  type ScoreSheetRow,
} from '../../lib/scoresheet';
import { fetchMyClasses } from '../../lib/results';

const TERMS = ['1st Term', '2nd Term', '3rd Term'];
const SESSIONS = ['2024/2025', '2025/2026', '2026/2027', '2027/2028'];

interface Props {
  role: string;
  userId: string;
  schoolName: string;
}

export default function ScoreSheet({ role, userId, schoolName }: Props) {
  const toast = useToast();
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [teacherName, setTeacherName] = useState('—');
  const [classId, setClassId] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [term, setTerm] = useState(TERMS[0]);
  const [session, setSession] = useState(SESSIONS[1]);

  const [rows, setRows] = useState<ScoreSheetRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchMyClasses(role, userId).then(setClasses);
    fetchScoreSheetSubjects(role, userId).then(setSubjects);
    fetchStaffName(userId).then(setTeacherName);
  }, [role, userId]);

  const className = classes.find((c) => c.id === classId);
  const classLabel = className ? `${className.name}${className.arm ? ' ' + className.arm : ''}` : '';

  async function handlePreview() {
    if (!classId || !subjectName) {
      toast.show('danger', 'Select class and subject.');
      return;
    }
    setLoading(true);
    setRows(null);
    try {
      const data = await fetchScoreSheetPreview(classId, subjectName, term, session);
      setRows(data);
    } finally {
      setLoading(false);
    }
  }

  const passCount = rows ? rows.filter((r) => r.total !== '—' && r.total !== 'AB' && parseFloat(r.total) >= 44).length : 0;
  const failCount = rows ? rows.filter((r) => r.total !== '—' && r.total !== 'AB' && parseFloat(r.total) < 44).length : 0;
  const gradeCounts: Record<string, number> = {};
  (rows ?? []).forEach((r) => {
    gradeCounts[r.gradeBand.g] = (gradeCounts[r.gradeBand.g] ?? 0) + 1;
  });

  async function handleExportPDF(filled: boolean) {
    if (!rows) return;
    setExporting(true);
    try {
      // Ported layout from the old app's _buildScoreSheetPDF (native jsPDF
      // draw calls, no autoTable/html2canvas) — compact 18mm brown header
      // bar, title, meta chips, dynamically-sized rows so the sheet always
      // fits one A4 portrait page. Standard "helvetica" font is used here
      // instead of the old app's embedded DejaVuSans/Naira-glyph subset —
      // that font exists solely so ₦ amounts render correctly on
      // payslip/receipt PDFs elsewhere in the app; nothing on a score
      // sheet ever needs a currency glyph, so re-embedding ~140KB of font
      // data for this screen isn't worth it. Everything else — colors,
      // spacing, column layout, row-height/font scaling — matches.
      const { default: jsPDF } = await import('jspdf');
      const BR: [number, number, number] = [93, 64, 55];
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const W = 210, ML = 8, MR = 8;
      const CW = W - ML - MR;
      let y = 0;

      pdf.setFillColor(...BR);
      pdf.rect(0, 0, W, 18, 'F');
      pdf.setFillColor(201, 162, 75);
      pdf.rect(0, 18, W, 1, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.text(schoolName.toUpperCase(), W / 2, 7.5, { align: 'center' });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.5);
      pdf.text('Wisdom, Knowledge and Success', W / 2, 12, { align: 'center' });
      pdf.text('Odukpani LGA, Cross River State, Nigeria', W / 2, 16, { align: 'center' });
      y = 23;

      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9.5);
      pdf.text(filled ? 'SCORE SHEET (FILLED)' : 'SCORE SHEET (BLANK — HANDWRITE)', W / 2, y, { align: 'center' });
      y += 4;
      pdf.setDrawColor(...BR);
      pdf.setLineWidth(0.4);
      pdf.line(ML, y, W - MR, y);
      y += 3;

      const chips: [string, string][] = [
        ['Teacher', teacherName],
        ['Class', classLabel],
        ['Subject', subjectName],
        ['Term', term],
        ['Session', session],
      ];
      let cx = ML;
      chips.forEach(([l, v]) => {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(5.5);
        pdf.setTextColor(120, 90, 80);
        pdf.text(l.toUpperCase(), cx, y);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7.5);
        pdf.setTextColor(0, 0, 0);
        pdf.text(v, cx, y + 3.5);
        cx += CW / chips.length;
      });
      y += 8;

      const cols = [
        { l: '#', w: 7, align: 'center' as const },
        { l: 'Student Name', w: 54, align: 'left' as const },
        { l: 'Adm No', w: 28, align: 'left' as const },
        { l: 'CA (30)', w: 18, align: 'center' as const },
        { l: 'Exam (70)', w: 20, align: 'center' as const },
        { l: 'Total', w: 17, align: 'center' as const },
        { l: 'Grade', w: 15, align: 'center' as const },
        { l: 'Remarks', w: 35, align: 'left' as const },
      ];
      const drawHeader = (yPos: number) => {
        pdf.setFillColor(...BR);
        pdf.rect(ML, yPos, CW, 6, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6.5);
        let hx = ML;
        cols.forEach((c) => {
          pdf.text(c.l, c.align === 'center' ? hx + c.w / 2 : hx + 1.5, yPos + 4.1, { align: c.align === 'center' ? 'center' : 'left' });
          hx += c.w;
        });
        return yPos + 6;
      };
      y = drawHeader(y);

      const MAX_PER_PAGE = 65;
      const AVAIL = 275 - y;
      const ROW_H = rows.length <= MAX_PER_PAGE ? Math.min(7, AVAIL / Math.max(1, rows.length)) : AVAIL / MAX_PER_PAGE;
      const rowFs = ROW_H >= 6 ? 7.5 : ROW_H >= 4.5 ? 7.0 : ROW_H >= 3.8 ? 6.5 : 6.0;
      const textOff = ROW_H * 0.68;

      rows.forEach((r, idx) => {
        if (y + ROW_H > 275.5) {
          pdf.addPage();
          y = 12;
          y = drawHeader(y);
        }
        pdf.setFillColor(idx % 2 === 0 ? 255 : 249, idx % 2 === 0 ? 255 : 249, idx % 2 === 0 ? 255 : 249);
        pdf.rect(ML, y, CW, ROW_H, 'F');
        pdf.setDrawColor(90, 74, 66);
        pdf.setLineWidth(0.4);
        pdf.line(ML, y + ROW_H, ML + CW, y + ROW_H);
        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(rowFs);
        const maxName = ROW_H >= 5 ? 28 : 25;
        const vals = [
          String(r.index),
          r.name.length > maxName ? r.name.substring(0, maxName - 1) + '…' : r.name,
          r.admissionNumber,
          filled ? r.ca : '',
          filled ? r.exam : '',
          filled ? r.total : '',
          filled ? r.gradeBand.g : '',
          filled ? r.gradeBand.r : '',
        ];
        let rx = ML;
        cols.forEach((c, ci) => {
          const v = vals[ci] || '';
          if (ci === 1 || ci === 7) pdf.text(v, rx + 1.5, y + textOff, { align: 'left' });
          else pdf.text(v, rx + c.w / 2, y + textOff, { align: 'center' });
          pdf.setDrawColor(90, 74, 66);
          pdf.setLineWidth(0.4);
          if (ci > 0) pdf.line(rx, y, rx, y + ROW_H);
          rx += c.w;
        });
        y += ROW_H;
      });

      if (y > 287) {
        pdf.addPage();
        y = 12;
      }
      y += 4;
      pdf.setDrawColor(150, 150, 150);
      pdf.setLineWidth(0.3);
      pdf.line(ML, y, ML + 50, y);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.setTextColor(0, 0, 0);
      pdf.text("Teacher's Signature", ML, y + 3.5);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.5);
      pdf.setTextColor(130, 130, 130);
      pdf.text('Generated: ' + new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }), W - MR, y + 3.5, { align: 'right' });

      pdf.save(`${filled ? 'Filled' : 'Blank'}_ScoreSheet_${classLabel}_${subjectName}_${term}_${session}.pdf`.replace(/\s+/g, '_'));
      toast.show('success', `✅ ${filled ? 'Filled' : 'Blank'} Score Sheet downloaded!`);
    } catch (err) {
      toast.show('danger', 'Could not build PDF — see console for details.');
      console.error(err);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card title="Generate Score Sheet">
        <div className="flex flex-wrap items-end gap-3">
          <Select
            id="sc-cid"
            label="Class"
            placeholder="Select Class"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            options={classes.map((c) => ({ value: c.id, label: `${c.name}${c.arm ? ' ' + c.arm : ''}` }))}
          />
          <Select
            id="sc-sid"
            label="Subject"
            placeholder="Select Subject"
            value={subjectName}
            onChange={(e) => setSubjectName(e.target.value)}
            options={subjects.map((s) => ({ value: s.name, label: s.name }))}
          />
          <Select id="sc-term" label="Term" value={term} onChange={(e) => setTerm(e.target.value)} options={TERMS.map((t) => ({ value: t, label: t }))} />
          <Select id="sc-sess" label="Session" value={session} onChange={(e) => setSession(e.target.value)} options={SESSIONS.map((s) => ({ value: s, label: s }))} />
          <Button onClick={handlePreview} disabled={loading}>
            {loading ? 'Loading…' : 'Preview'}
          </Button>
        </div>
      </Card>

      {rows && (
        <Card title={`${classLabel} — ${subjectName} — ${term}, ${session}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-brand-cream text-brand-brown-dark text-xs uppercase">
                  <th className="border border-brand-cream-dark px-2 py-1.5">#</th>
                  <th className="border border-brand-cream-dark px-2 py-1.5 text-left">Student Name</th>
                  <th className="border border-brand-cream-dark px-2 py-1.5">Adm No</th>
                  <th className="border border-brand-cream-dark px-2 py-1.5">CA (30)</th>
                  <th className="border border-brand-cream-dark px-2 py-1.5">Exam (70)</th>
                  <th className="border border-brand-cream-dark px-2 py-1.5">Total</th>
                  <th className="border border-brand-cream-dark px-2 py-1.5">Grade</th>
                  <th className="border border-brand-cream-dark px-2 py-1.5">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-6 text-brand-brown-light">No results found.</td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.admissionNumber} className="hover:bg-brand-cream/50">
                      <td className="border border-brand-cream-dark px-2 py-1.5 text-center text-brand-brown-light">{r.index}</td>
                      <td className="border border-brand-cream-dark px-2 py-1.5 font-semibold text-brand-brown-dark">{r.name}</td>
                      <td className="border border-brand-cream-dark px-2 py-1.5 text-center text-xs text-brand-brown-light">{r.admissionNumber}</td>
                      <td className="border border-brand-cream-dark px-2 py-1.5 text-center">{r.ca}</td>
                      <td className="border border-brand-cream-dark px-2 py-1.5 text-center">{r.exam}</td>
                      <td className="border border-brand-cream-dark px-2 py-1.5 text-center font-bold">{r.total}</td>
                      <td className="border border-brand-cream-dark px-2 py-1.5 text-center">
                        <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: r.gradeBand.c + '20', color: r.gradeBand.c }}>
                          {r.gradeBand.g}
                        </span>
                      </td>
                      <td className="border border-brand-cream-dark px-2 py-1.5 text-center font-medium" style={{ color: r.gradeBand.c }}>
                        {r.gradeBand.r}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {rows.length > 0 && (
            <div className="mt-4 rounded-md bg-brand-cream p-3">
              <div className="text-xs font-semibold uppercase text-brand-brown-light mb-2">Grade Distribution</div>
              <div className="flex flex-wrap gap-2 text-xs font-bold">
                {Object.entries(gradeCounts).map(([g, count]) => (
                  <span key={g} className="rounded-md px-3 py-1 bg-white">{g}: {count}</span>
                ))}
                <span className="rounded-md px-3 py-1 bg-white">Total: {rows.length}</span>
                <span className="rounded-md px-3 py-1 bg-success-soft text-success-700">Pass: {passCount}</span>
                <span className="rounded-md px-3 py-1 bg-danger-soft text-danger-700">Fail: {failCount}</span>
              </div>
            </div>
          )}

          <div className="flex gap-2 flex-wrap mt-4">
            <Button variant="secondary" onClick={() => handleExportPDF(false)} disabled={exporting || rows.length === 0}>
              {exporting ? 'Building…' : 'Download Blank Sheet'}
            </Button>
            <Button onClick={() => handleExportPDF(true)} disabled={exporting || rows.length === 0}>
              {exporting ? 'Building…' : 'Download Filled Sheet'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
