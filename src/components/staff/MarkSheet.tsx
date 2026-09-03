import { useEffect, useState } from 'react';
import Select from '../ui/Select';
import Button from '../ui/Button';
import Card from '../ui/Card';
import { useToast } from '../ui/Toast';
import { fetchMarkSheetData, fetchStaffName, ordinal, type MarkSheetData } from '../../lib/scoresheet';
import { fetchMyClasses, type ClassOption } from '../../lib/results';

const TERMS = ['1st Term', '2nd Term', '3rd Term'];
const SESSIONS = ['2024/2025', '2025/2026', '2026/2027', '2027/2028'];

interface Props {
  role: string;
  userId: string;
  schoolName: string;
}

export default function MarkSheet({ role, userId, schoolName }: Props) {
  const toast = useToast();
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [teacherName, setTeacherName] = useState('—');
  const [classId, setClassId] = useState('');
  const [term, setTerm] = useState(TERMS[0]);
  const [session, setSession] = useState(SESSIONS[1]);

  const [data, setData] = useState<MarkSheetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const locked = role === 'subject_teacher'; // mirrors renderMarkSheet()'s hard toast+return

  useEffect(() => {
    if (locked) return;
    fetchMyClasses(role, userId).then(setClasses);
    fetchStaffName(userId).then(setTeacherName);
  }, [role, userId, locked]);

  const className = classes.find((c) => c.id === classId);
  const classLabel = className ? `${className.name}${className.arm ? ' ' + className.arm : ''}` : '';

  async function handlePreview() {
    if (!classId) {
      toast.show('danger', 'Select a class.');
      return;
    }
    setLoading(true);
    setData(null);
    try {
      const result = await fetchMarkSheetData(classId, term, session);
      if (!result.rows.length) {
        toast.show('danger', 'No students found in this class.');
        return;
      }
      setData(result);
    } finally {
      setLoading(false);
    }
  }

  // Ported from the old app's _msSizing(n) — column widths/font sizes that
  // scale down as subject count grows, so 1–16 subjects always fit one
  // A4 portrait page.
  function msSizing(n: number) {
    n = Math.max(1, Math.min(16, n || 1));
    if (n <= 5) return { thFs: 9, tdFs: 8.8, thPadV: 5, thPadH: 5, tdPadV: 3.5, tdPadH: 4, scoreW: 42, nameW: 162, narrowW: 26, wideW: 42, hdrH: 108 };
    if (n <= 8) return { thFs: 8.5, tdFs: 8.3, thPadV: 4, thPadH: 4, tdPadV: 3, tdPadH: 3, scoreW: 36, nameW: 150, narrowW: 22, wideW: 38, hdrH: 100 };
    if (n <= 11) return { thFs: 8, tdFs: 7.9, thPadV: 4, thPadH: 3, tdPadV: 2.8, tdPadH: 3, scoreW: 30, nameW: 136, narrowW: 20, wideW: 33, hdrH: 93 };
    if (n <= 13) return { thFs: 7.5, tdFs: 7.4, thPadV: 3, thPadH: 3, tdPadV: 2.5, tdPadH: 2, scoreW: 26, nameW: 124, narrowW: 18, wideW: 30, hdrH: 87 };
    return { thFs: 7, tdFs: 7.0, thPadV: 3, thPadH: 2, tdPadV: 2.2, tdPadH: 2, scoreW: 23, nameW: 112, narrowW: 16, wideW: 28, hdrH: 82 };
  }

  // Ported from _msChunkTableHTML — builds the same styled HTML table (bold
  // grid lines, CSS-rotated vertical subject headers) the old app then
  // rasterizes with html2canvas. columns here are the five trailing
  // summary columns (Total Obt./Total Poss./Average/Position/Remarks).
  function buildMarkSheetTableHTML(
    sz: ReturnType<typeof msSizing>,
    subjects: string[],
    rows: MarkSheetData['rows'],
    BR: string
  ) {
    const bdr = `2px solid #c5b09a`;
    const bdrBold = `3px solid ${BR}`;
    const thS = `background:#F8F1E3;color:${BR};border:2px solid #c5b09a;font-weight:700;font-size:${sz.thFs}px;vertical-align:bottom;text-align:center;padding:0;`;
    const tdS = `padding:${sz.tdPadV}px ${sz.tdPadH}px;text-align:center;font-size:${sz.tdFs}px;border:${bdr};`;
    const columns: { label: string; w: number; render: (s: MarkSheetData['rows'][number]) => string }[] = [
      { label: 'Total<br>Obt.', w: sz.wideW, render: (s) => `<td style="${tdS}font-weight:700;">${s.totalObt.toFixed(0)}</td>` },
      { label: 'Total<br>Poss.', w: sz.wideW, render: (s) => `<td style="${tdS}">${s.totalPoss}</td>` },
      { label: 'Average<br>%', w: sz.wideW, render: (s) => `<td style="${tdS}font-weight:700;color:${s.avg >= 44 ? '#15803D' : '#B91C1C'};">${s.avg}%</td>` },
      { label: 'Position', w: sz.narrowW + 12, render: (s) => `<td style="${tdS}font-weight:700;">${ordinal(s.position)}</td>` },
      { label: 'Remarks', w: sz.wideW, render: (s) => `<td style="${tdS}">${s.avg >= 44 ? '<span style="color:#15803D;font-weight:700;">PASS</span>' : '<span style="color:#B91C1C;font-weight:700;">FAIL</span>'}</td>` },
    ];
    const totalCols = 2 + subjects.length + columns.length;
    const tableW = sz.narrowW + sz.nameW + subjects.length * sz.scoreW + columns.reduce((a, c) => a + c.w, 0);
    const colGroup = `<colgroup><col style="width:${sz.narrowW}px"><col style="width:${sz.nameW}px">${subjects.map(() => `<col style="width:${sz.scoreW}px">`).join('')}${columns.map((c) => `<col style="width:${c.w}px">`).join('')}</colgroup>`;
    const maxSubjLen = subjects.reduce((m, s) => Math.max(m, (s || '').length), 4);
    const hdrH = Math.max(sz.hdrH, Math.min(140, Math.ceil(maxSubjLen * sz.thFs * 0.57) + 14));
    const vCell = (label: string, fs?: number) => `<div style="height:${hdrH}px;display:flex;align-items:center;justify-content:center;overflow:hidden;"><span style="display:inline-block;transform:rotate(-90deg);white-space:nowrap;font-size:${fs || sz.thFs}px;line-height:1;font-weight:700;">${label}</span></div>`;
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const subjectHeaders = subjects.map((s) => `<th style="${thS}">${vCell(esc(s), sz.thFs - 0.5)}</th>`).join('');
    const trailHeaders = columns.map((c) => `<th style="${thS}">${vCell(c.label.replace(/<br\s*\/?>/gi, ' '), sz.thFs - 0.5)}</th>`).join('');
    const bodyRows = rows
      .map((s, i) => {
        const subCells = s.subs
          .map((sb) => {
            if (!sb) return `<td style="${tdS}color:#bbb;">-</td>`;
            const isAb = sb.is_absent || sb.grade === 'AB';
            const val = isAb ? 'AB' : sb.total ?? 0;
            const fail = !isAb && (sb.total ?? 0) < 40;
            return `<td style="${tdS}font-weight:700;${fail ? 'color:#B91C1C;' : isAb ? 'color:#888;' : ''}">${val}</td>`;
          })
          .join('');
        const trailCells = columns.map((c) => c.render(s)).join('');
        const even = i % 2 === 0;
        return `<tr style="background:${even ? '#fff' : '#f9f5f0'}">
          <td style="${tdS}color:#aaa;font-size:${sz.tdFs - 0.5}px;">${i + 1}</td>
          <td style="${tdS}font-weight:700;color:${BR};text-align:left;border-left:${bdrBold};">${esc(s.full_name)}</td>
          ${subCells}${trailCells}
        </tr>`;
      })
      .join('');

    return `<table style="border-collapse:collapse;font-family:sans-serif;table-layout:fixed;width:${tableW}px;background:#fff;border:2.5px solid ${BR};">
      ${colGroup}
      <thead>
        <tr><td colspan="${totalCols}" style="padding:8px 14px;background:${BR};color:#fff;border:none;">
          <div style="text-align:center;">
            <div style="font-family:serif;font-size:${sz.thFs + 7}px;font-weight:800;letter-spacing:.3px;">${esc(schoolName)}</div>
            <div style="font-size:${sz.thFs}px;opacity:.85;font-style:italic;">Wisdom, Knowledge and Success</div>
            <div style="font-size:${sz.thFs - 0.5}px;opacity:.75;">Odukpani LGA, Cross River State, Nigeria</div>
          </div>
        </td></tr>
        <tr><td colspan="${totalCols}" style="padding:5px 10px;text-align:center;font-size:${sz.thFs + 2}px;font-weight:700;color:${BR};background:#F8F1E3;border:2px solid ${BR};">MARK SHEET — ${classLabel.toUpperCase()} — ${term.toUpperCase()}, ${session}</td></tr>
        <tr>
          <th style="${thS}">${vCell('#', sz.thFs)}</th>
          <th style="${thS};text-align:left;vertical-align:middle;padding:6px ${sz.thPadH}px;">Student Name</th>
          ${subjectHeaders}${trailHeaders}
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>`;
  }

  async function handleExportPDF() {
    if (!data) return;
    setExporting(true);
    try {
      // Ported from the old app's _renderMarkSheetPDF: rasterize the styled
      // HTML table (rotated headers, bold grid) with html2canvas and drop
      // it into an A4 portrait page, chunked at 65 rows/page so a class
      // never has a row sliced across pages. Uses the npm html2canvas
      // package instead of the old app's CDN script-tag loader — same
      // library, same version family, loaded the way this port already
      // loads jsPDF/xlsx (dynamic import, not a runtime <script> injection).
      const { default: jsPDF } = await import('jspdf');
      const html2canvas = (await import('html2canvas')).default;

      const sz = msSizing(data.subjects.length);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const W = pdf.internal.pageSize.getWidth();
      const H = pdf.internal.pageSize.getHeight();
      const margin = 5;
      const usableW = W - margin * 2;
      const usableH = H - margin * 2;
      const BR = '#5D4037';

      const ROWS_PER_PAGE = 65; // matches _msRowsPerPage's fixed value
      const chunks: MarkSheetData['rows'][] = [];
      for (let i = 0; i < data.rows.length; i += ROWS_PER_PAGE) chunks.push(data.rows.slice(i, i + ROWS_PER_PAGE));
      if (!chunks.length) chunks.push([]);

      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-99999px;top:0;background:#fff;z-index:-1;';
      document.body.appendChild(host);
      const genDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

      try {
        for (let p = 0; p < chunks.length; p++) {
          host.innerHTML = buildMarkSheetTableHTML(sz, data.subjects, chunks[p], BR);
          await new Promise((r) => setTimeout(r, 0));
          const tbl = host.firstElementChild as HTMLElement;
          const canvas = await html2canvas(tbl, { scale: 2.2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
          const ratio = canvas.width / canvas.height;
          let drawW = usableW,
            drawH = usableW / ratio,
            dx = margin,
            dy = margin;
          if (drawH > usableH) {
            drawH = usableH;
            drawW = usableH * ratio;
            dx = margin + (usableW - drawW) / 2;
          }
          if (p > 0) pdf.addPage();
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.86), 'JPEG', dx, dy, drawW, drawH);
          pdf.setFontSize(7);
          pdf.setTextColor(130, 110, 95);
          pdf.text(
            `Page ${p + 1} of ${chunks.length}  ·  Students: ${data.rows.length}  ·  Subjects: ${data.subjects.length}  ·  Generated: ${genDate}  ·  Class Teacher: ${teacherName}`,
            W / 2,
            H - 2.3,
            { align: 'center' }
          );
        }
      } finally {
        host.remove();
      }

      pdf.save(`Mark_Sheet_${classLabel}_${term}_${session}.pdf`.replace(/\s+/g, '_'));
      toast.show('success', '✅ Mark Sheet downloaded!');
    } catch (err) {
      toast.show('danger', 'Could not build PDF — see console for details.');
      console.error(err);
    } finally {
      setExporting(false);
    }
  }

  if (locked) {
    return (
      <div className="rounded-lg bg-danger-soft p-8 text-center">
        <p className="text-danger-700 font-semibold">Subject teachers do not have access to Mark Sheets.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Card title="Generate Mark Sheet">
        <div className="flex flex-wrap items-end gap-3">
          <Select
            id="mk-cid"
            label="Class"
            placeholder="Select Class"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            options={classes.map((c) => ({ value: c.id, label: `${c.name}${c.arm ? ' ' + c.arm : ''}` }))}
          />
          <Select id="mk-term" label="Term" value={term} onChange={(e) => setTerm(e.target.value)} options={TERMS.map((t) => ({ value: t, label: t }))} />
          <Select id="mk-sess" label="Session" value={session} onChange={(e) => setSession(e.target.value)} options={SESSIONS.map((s) => ({ value: s, label: s }))} />
          <Button onClick={handlePreview} disabled={loading}>
            {loading ? 'Loading…' : 'Generate Preview'}
          </Button>
        </div>
      </Card>

      {data && (
        <Card title={`${classLabel} — ${term}, ${session}`}>
          {data.hasNoScores && (
            <div className="rounded-md bg-warning-soft text-warning-700 text-sm px-3 py-2 mb-3">
              No scores have been entered for {term}, {session} yet — every student will show 0% until subject scores are entered and saved.
            </div>
          )}
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="text-xs border-collapse w-full">
              <thead>
                <tr className="bg-brand-cream">
                  <th className="border border-brand-cream-dark px-2 py-1">#</th>
                  <th className="border border-brand-cream-dark px-2 py-1 text-left">Student Name</th>
                  {data.subjects.map((s) => (
                    <th key={s} className="border border-brand-cream-dark px-2 py-1 whitespace-nowrap">{s}</th>
                  ))}
                  <th className="border border-brand-cream-dark px-2 py-1">Total Obt.</th>
                  <th className="border border-brand-cream-dark px-2 py-1">Total Poss.</th>
                  <th className="border border-brand-cream-dark px-2 py-1">Average %</th>
                  <th className="border border-brand-cream-dark px-2 py-1">Position</th>
                  <th className="border border-brand-cream-dark px-2 py-1">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((s, i) => (
                  <tr key={s.id} className="hover:bg-brand-cream/50">
                    <td className="border border-brand-cream-dark px-2 py-1 text-center text-brand-brown-light">{i + 1}</td>
                    <td className="border border-brand-cream-dark px-2 py-1 font-semibold text-brand-brown-dark whitespace-nowrap">{s.full_name}</td>
                    {s.subs.map((c, ci) => {
                      const isAb = c?.is_absent || c?.grade === 'AB';
                      const val = c === null ? '-' : isAb ? 'AB' : c.total ?? 0;
                      const fail = c !== null && !isAb && (c.total ?? 0) < 40;
                      return (
                        <td key={ci} className={`border border-brand-cream-dark px-2 py-1 text-center font-bold ${fail ? 'text-danger-700' : c === null ? 'text-brand-brown-light' : ''}`}>
                          {val}
                        </td>
                      );
                    })}
                    <td className="border border-brand-cream-dark px-2 py-1 text-center font-bold">{s.totalObt.toFixed(0)}</td>
                    <td className="border border-brand-cream-dark px-2 py-1 text-center">{s.totalPoss}</td>
                    <td className={`border border-brand-cream-dark px-2 py-1 text-center font-bold ${s.avg >= 44 ? 'text-success-700' : 'text-danger-700'}`}>{s.avg}%</td>
                    <td className="border border-brand-cream-dark px-2 py-1 text-center font-bold">{ordinal(s.position)}</td>
                    <td className="border border-brand-cream-dark px-2 py-1 text-center">
                      {s.avg >= 44 ? <span className="text-success-700 font-bold">PASS</span> : <span className="text-danger-700 font-bold">FAIL</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-brand-brown-light mt-3">
            Students: {data.rows.length} · Subjects: {data.subjects.length} · Class Teacher: {teacherName}
          </p>
          <div className="flex gap-2 mt-4">
            <Button onClick={handleExportPDF} disabled={exporting}>
              {exporting ? 'Building…' : 'Download PDF'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
