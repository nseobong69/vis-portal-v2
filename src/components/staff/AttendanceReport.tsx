import { useEffect, useState } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { useToast } from '../ui/Toast';
import {
  DAYS,
  fetchReportData,
  computeAttendanceStats,
  type ReportData,
} from '../../lib/attendance';

interface Props {
  session: string;
  term: string;
  classId: string;
  schoolName: string;
}

const DABBR: Record<(typeof DAYS)[number], string> = {
  Monday: 'M', Tuesday: 'T', Wednesday: 'W', Thursday: 'T', Friday: 'F',
};

export default function AttendanceReport({ session, term, classId, schoolName }: Props) {
  const toast = useToast();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchReportData(session, term, classId)
      .then(setData)
      .finally(() => setLoading(false));
  }, [session, term, classId]);

  const stats = data ? computeAttendanceStats(data) : null;

  async function handleExportPDF() {
    if (!data || !stats) return;
    setExporting('pdf');
    try {
      // Dynamically imported — jsPDF/autotable only need to load on export,
      // not on first paint of the register.
      const { default: jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const weekChunks: (typeof data.weeks)[] = [];
      for (let i = 0; i < data.weeks.length; i += 4) weekChunks.push(data.weeks.slice(i, i + 4));

      weekChunks.forEach((chunk, pageIdx) => {
        if (pageIdx > 0) pdf.addPage();
        pdf.setFontSize(14);
        pdf.text(schoolName, 14, 12);
        pdf.setFontSize(9);
        pdf.text(`Attendance Register — ${term}, ${session} · Class: ${data.className}`, 14, 18);

        const head: string[][] = [
          ['#', 'Student', ...chunk.flatMap((w) => DAYS.flatMap((d) => [`Wk${w.week_number} ${DABBR[d]}(M)`, `Wk${w.week_number} ${DABBR[d]}(A)`])), 'Total'],
        ];
        const body = data.students.map((s, i) => {
          const p = stats.perStudent.find((x) => x.id === s.id)!;
          const cells: string[] = [];
          chunk.forEach((w) => {
            DAYS.forEach((day) => {
              const ds = data.dayMap[`${w.week_number}:${day}`];
              const rec = ds?.date ? data.recMap[`${s.id}:${ds.date}`] : undefined;
              if (!ds) { cells.push('—', '—'); return; }
              if (ds.status === 'closed') { cells.push('CL', 'CL'); return; }
              cells.push(rec?.morning_status === 'present' ? '✓' : '–', rec?.afternoon_status === 'present' ? '✓' : '–');
            });
          });
          return [String(i + 1), s.full_name, ...cells, String(p.grand)];
        });

        autoTable(pdf, {
          head,
          body,
          startY: 22,
          styles: { fontSize: 6.5, cellPadding: 1, halign: 'center' },
          columnStyles: { 1: { halign: 'left', cellWidth: 32 } },
          headStyles: { fillColor: [93, 64, 55], textColor: 255 },
        });
      });

      // Final term-summary page.
      pdf.addPage();
      pdf.setFontSize(14);
      pdf.text(`${schoolName} — Term Summary`, 14, 14);
      autoTable(pdf, {
        startY: 22,
        head: [['Student', 'Adm No', ...data.weeks.map((w) => `Wk ${w.week_number}`), 'Total']],
        body: data.students.map((s) => {
          const p = stats.perStudent.find((x) => x.id === s.id)!;
          return [s.full_name, s.admission_number, ...data.weeks.map((w) => String(p.byWeek[w.week_number] ?? 0)), String(p.grand)];
        }),
        foot: [[`Students: ${data.students.length} (${stats.maleCount}M, ${data.students.length - stats.maleCount}F)`, '', ...data.weeks.map(() => ''), `${stats.termAvgPct}%`]],
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: { fillColor: [93, 64, 55], textColor: 255 },
      });

      pdf.save(`VIS_Attendance_${session.replace('/', '-')}_${term.replace(/\s/g, '_')}.pdf`);
    } catch (err) {
      toast.show('danger', 'Could not build PDF — see console for details.');
      console.error(err);
    } finally {
      setExporting(null);
    }
  }

  async function handleExportExcel() {
    if (!data || !stats) return;
    setExporting('excel');
    try {
      const XLSX = await import('xlsx');
      const header = ['#', 'Student', 'Adm No', ...data.weeks.flatMap((w) => DAYS.flatMap((d) => [`Wk${w.week_number} ${d} (M)`, `Wk${w.week_number} ${d} (A)`])), 'Total'];
      const rows = data.students.map((s, i) => {
        const p = stats.perStudent.find((x) => x.id === s.id)!;
        const cells: (string | number)[] = [];
        data.weeks.forEach((w) => {
          DAYS.forEach((day) => {
            const ds = data.dayMap[`${w.week_number}:${day}`];
            const rec = ds?.date ? data.recMap[`${s.id}:${ds.date}`] : undefined;
            if (!ds) { cells.push('', ''); return; }
            if (ds.status === 'closed') { cells.push(ds.closure_reason ?? 'Closed', ds.closure_reason ?? 'Closed'); return; }
            cells.push(rec?.morning_status === 'present' ? 1 : 0, rec?.afternoon_status === 'present' ? 1 : 0);
          });
        });
        return [i + 1, s.full_name, s.admission_number, ...cells, p.grand];
      });
      rows.push([]);
      rows.push([`Term Openings: ${stats.termOpenDays} days`, '', '', `Attendance Average: ${stats.termAvgPct}%`]);

      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
      XLSX.writeFile(wb, `VIS_Attendance_${session.replace('/', '-')}_${term.replace(/\s/g, '_')}.xlsx`);
    } catch (err) {
      toast.show('danger', 'Could not build Excel file — see console for details.');
      console.error(err);
    } finally {
      setExporting(null);
    }
  }

  if (loading) return <p className="text-sm text-brand-brown-light">Building report…</p>;
  if (!data || !stats) return <p className="text-sm text-brand-brown-light">No students found for this class.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 flex-wrap">
        <Button variant="secondary" onClick={() => window.print()}>Print</Button>
        <Button variant="secondary" onClick={handleExportPDF} disabled={exporting !== null}>
          {exporting === 'pdf' ? 'Building PDF…' : 'Export PDF'}
        </Button>
        <Button variant="secondary" onClick={handleExportExcel} disabled={exporting !== null}>
          {exporting === 'excel' ? 'Building Excel…' : 'Export Excel'}
        </Button>
      </div>

      <Card title={`Attendance Register — ${term}, ${session} · ${data.className}`}>
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr className="bg-brand-cream">
                <th className="border border-brand-cream-dark px-2 py-1">#</th>
                <th className="border border-brand-cream-dark px-2 py-1 text-left">Student</th>
                {data.weeks.map((w) => (
                  <th key={w.id} colSpan={10} className="border border-brand-cream-dark px-2 py-1">Wk {w.week_number}</th>
                ))}
                <th className="border border-brand-cream-dark px-2 py-1">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.students.map((s, i) => {
                const p = stats.perStudent.find((x) => x.id === s.id)!;
                return (
                  <tr key={s.id} className="hover:bg-brand-cream/50">
                    <td className="border border-brand-cream-dark px-2 py-1 text-center">{i + 1}</td>
                    <td className="border border-brand-cream-dark px-2 py-1 whitespace-nowrap">{s.full_name}</td>
                    {data.weeks.map((w) =>
                      DAYS.map((day) => {
                        const ds = data.dayMap[`${w.week_number}:${day}`];
                        const rec = ds?.date ? data.recMap[`${s.id}:${ds.date}`] : undefined;
                        const closed = ds?.status === 'closed';
                        return (
                          <td key={`${w.id}-${day}`} colSpan={closed ? 2 : undefined}
                            className={`border border-brand-cream-dark px-1 py-1 text-center ${closed ? 'bg-danger-soft text-danger-700' : ''}`}>
                            {!ds ? '—' : closed ? (ds.closure_reason ?? 'Closed').slice(0, 6) : (
                              <>
                                <span className={rec?.morning_status === 'present' ? 'text-success-700' : 'text-danger-700'}>M</span>{' '}
                                <span className={rec?.afternoon_status === 'present' ? 'text-success-700' : 'text-danger-700'}>A</span>
                              </>
                            )}
                          </td>
                        );
                      })
                    )}
                    <td className="border border-brand-cream-dark px-2 py-1 text-center font-semibold">{p.grand}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-brand-brown-light mt-3">
          Students: {data.students.length} ({stats.maleCount}M, {data.students.length - stats.maleCount}F) ·
          Term Openings: {stats.termOpenDays} days · Attendance Average: {stats.termAvgPct}%
        </p>
      </Card>
    </div>
  );
}
