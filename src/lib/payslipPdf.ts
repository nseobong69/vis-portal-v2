import { ensureNairaFont } from './nairaFont';
import { payrollPeriodLabel } from './payroll';

// ═══════════════════════════════════════════════════════════════════════════
// PAYSLIP PDF — ported from downloadPayslip() (index.html ~L20670-20797).
// Unlike Combined PDF/result cards (html2canvas rasterisation of an HTML
// template), this draws text and shapes directly onto the jsPDF canvas —
// the old app's own approach for this one document, kept as-is rather
// than converted to the html2canvas pattern used elsewhere, since a
// hand-drawn PDF is smaller/crisper for a simple one-page document like
// this and rewriting it as HTML would risk introducing new layout bugs
// for no real benefit.
// ═══════════════════════════════════════════════════════════════════════════

const fmtMoney = (n: number | string | null | undefined) =>
  '₦' + (parseFloat(String(n)) || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Mirrors shadeColor(hex, pct) — lightens/darkens a hex color by pct%. */
function shadeColor(hex: string, pct: number): string {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  r = Math.min(255, Math.max(0, Math.round(r * (1 + pct / 100))));
  g = Math.min(255, Math.max(0, Math.round(g * (1 + pct / 100))));
  b = Math.min(255, Math.max(0, Math.round(b * (1 + pct / 100))));
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Mirrors _loadLogoDataUrl(logoUrl) — downscales the school logo to a
 *  small embeddable data URL, white-backed unless it's already a PNG. */
async function loadLogoDataUrl(logoUrl: string | null, maxPx = 72, quality = 0.4): Promise<string | null> {
  if (!logoUrl) return null;
  try {
    return await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const ratio = Math.min(maxPx / (img.naturalWidth || 1), maxPx / (img.naturalHeight || 1), 1);
        const w = Math.max(1, Math.round(img.naturalWidth * ratio));
        const h = Math.max(1, Math.round(img.naturalHeight * ratio));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d')!;
        const isPNG = logoUrl.toLowerCase().includes('.png') || logoUrl.startsWith('data:image/png');
        if (!isPNG) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        resolve(isPNG ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = logoUrl;
    });
  } catch {
    return null;
  }
}

function hexToRGB(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

export interface Payslip {
  id: string;
  staff_name: string | null;
  role: string | null;
  period: string;
  basic_salary: number | null;
  allowance_housing: number | null;
  allowance_transport: number | null;
  allowance_other: number | null;
  gross_pay: number | null;
  deduction_tax: number | null;
  deduction_pension: number | null;
  deduction_other: number | null;
  total_deductions: number | null;
  net_pay: number | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  generated_at: string | null;
}

export interface SchoolSettingsForPayslip {
  logo_url?: string | null;
  primary_color?: string | null;
  school_name?: string | null;
  motto?: string | null;
  address?: string | null;
  phone1?: string | null;
  phone2?: string | null;
  email?: string | null;
}

/** Mirrors downloadPayslip(id) minus the initial Supabase fetch — the
 *  caller passes the already-loaded payslip + school settings in. */
export async function downloadPayslipPdf(sl: Payslip, SS: SchoolSettingsForPayslip): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  ensureNairaFont(pdf);
  const F = 'DejaVuSans';
  const W = 210,
    H = 297;
  const logoData = await loadLogoDataUrl(SS.logo_url || null);
  const priHex = SS.primary_color || '#5D4037';
  const priDarkHex = shadeColor(priHex, -25);
  const goldHex = '#C9A24B';
  const [pR, pG, pB] = hexToRGB(priHex);
  const [dR, dG, dB] = hexToRGB(priDarkHex);
  const [gR, gG, gB] = hexToRGB(goldHex);

  // ── Header band ──
  pdf.setFillColor(pR, pG, pB);
  pdf.rect(0, 0, W, 30, 'F');
  pdf.setFillColor(gR, gG, gB);
  pdf.rect(0, 30, W, 1.2, 'F');
  if (logoData) {
    try {
      pdf.addImage(logoData, 'JPEG', 11, 6, 17, 17);
    } catch {}
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(12.5);
    pdf.setFont(F, 'bold');
    pdf.text(SS.school_name || 'SCHOOL', 32, 12, { maxWidth: W - 38 });
    pdf.setFontSize(6.8);
    pdf.setFont(F, 'normal');
    pdf.setTextColor(238, 222, 196);
    if (SS.motto) pdf.text(SS.motto, 32, 17.5);
    const addr = (SS.address || '').trim();
    if (addr) pdf.text(addr, 32, 22, { maxWidth: W - 46 });
    const contact = [SS.phone1, SS.phone2, SS.email].filter(Boolean).join('   ·   ');
    if (contact) pdf.text(contact, 32, 26, { maxWidth: W - 46 });
  } else {
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(13);
    pdf.setFont(F, 'bold');
    pdf.text(SS.school_name || 'SCHOOL', W / 2, 12, { align: 'center', maxWidth: W - 20 });
    pdf.setFontSize(6.8);
    pdf.setFont(F, 'normal');
    pdf.setTextColor(238, 222, 196);
    if (SS.motto) pdf.text(SS.motto, W / 2, 17.5, { align: 'center' });
    const addr = (SS.address || '').trim();
    if (addr) pdf.text(addr, W / 2, 22, { align: 'center', maxWidth: W - 20 });
    const contact = [SS.phone1, SS.phone2, SS.email].filter(Boolean).join('   ·   ');
    if (contact) pdf.text(contact, W / 2, 26, { align: 'center', maxWidth: W - 20 });
  }

  // ── Title strip ──
  pdf.setFillColor(dR, dG, dB);
  pdf.rect(0, 31.2, W, 10, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(9.5);
  pdf.setFont(F, 'bold');
  pdf.text('STAFF PAYSLIP  —  ' + payrollPeriodLabel(sl.period).toUpperCase(), W / 2, 37.7, { align: 'center' });

  let y = 52;
  // ── Employee info card ──
  pdf.setFillColor(250, 248, 245);
  pdf.rect(14, y - 8, W - 28, 22, 'F');
  pdf.setDrawColor(gR, gG, gB);
  pdf.setLineWidth(0.4);
  pdf.rect(14, y - 8, W - 28, 22, 'S');
  pdf.setTextColor(30, 30, 30);
  pdf.setFontSize(11);
  pdf.setFont(F, 'bold');
  pdf.text(sl.staff_name || '', 19, y);
  pdf.setFont(F, 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(dR, dG, dB);
  pdf.text((sl.role || '').replace(/_/g, ' ').toUpperCase(), 19, y + 6);
  pdf.setFontSize(8);
  pdf.setTextColor(90, 90, 90);
  pdf.setFont(F, 'bold');
  pdf.text('Payslip No:', W - 70, y - 2);
  pdf.text('Pay Period:', W - 70, y + 4);
  pdf.setFont(F, 'normal');
  pdf.setTextColor(30, 30, 30);
  pdf.text('PS-' + sl.id.toString().slice(-6).toUpperCase(), W - 19, y - 2, { align: 'right' });
  pdf.text(payrollPeriodLabel(sl.period), W - 19, y + 4, { align: 'right' });
  pdf.setFontSize(7);
  pdf.setTextColor(130, 130, 130);
  pdf.text(
    'Issued: ' + new Date(sl.generated_at || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    W - 19,
    y + 10,
    { align: 'right' }
  );
  y += 26;

  const rows: [string, number | null][] = [
    ['Basic Salary', sl.basic_salary],
    ['Housing Allowance', sl.allowance_housing],
    ['Transport Allowance', sl.allowance_transport],
    ['Other Allowance', sl.allowance_other],
  ];
  pdf.setFillColor(22, 163, 74);
  pdf.rect(14, y - 5, W - 28, 7, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont(F, 'bold');
  pdf.setFontSize(8.5);
  pdf.text('EARNINGS', 18, y);
  pdf.text('AMOUNT', W - 18, y, { align: 'right' });
  y += 8;
  pdf.setFont(F, 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(60, 60, 60);
  rows.forEach(([label, val], i) => {
    if (i % 2 === 0) {
      pdf.setFillColor(247, 253, 248);
      pdf.rect(14, y - 4.5, W - 28, 6.5, 'F');
    }
    pdf.text(label, 18, y);
    pdf.text(fmtMoney(val || 0), W - 18, y, { align: 'right' });
    y += 6.5;
  });
  pdf.setDrawColor(220, 220, 220);
  pdf.line(14, y, W - 14, y);
  y += 6;
  pdf.setFont(F, 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(30, 30, 30);
  pdf.text('Gross Pay', 18, y);
  pdf.text(fmtMoney(sl.gross_pay || 0), W - 18, y, { align: 'right' });
  y += 13;

  const dedRows: [string, number | null][] = [
    ['PAYE Tax', sl.deduction_tax],
    ['Pension', sl.deduction_pension],
    ['Other Deductions', sl.deduction_other],
  ];
  pdf.setFillColor(220, 38, 38);
  pdf.rect(14, y - 5, W - 28, 7, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont(F, 'bold');
  pdf.setFontSize(8.5);
  pdf.text('DEDUCTIONS', 18, y);
  pdf.text('AMOUNT', W - 18, y, { align: 'right' });
  y += 8;
  pdf.setFont(F, 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(60, 60, 60);
  dedRows.forEach(([label, val], i) => {
    if (i % 2 === 0) {
      pdf.setFillColor(253, 247, 247);
      pdf.rect(14, y - 4.5, W - 28, 6.5, 'F');
    }
    pdf.text(label, 18, y);
    pdf.text(fmtMoney(val || 0), W - 18, y, { align: 'right' });
    y += 6.5;
  });
  pdf.setDrawColor(220, 220, 220);
  pdf.line(14, y, W - 14, y);
  y += 6;
  pdf.setFont(F, 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(30, 30, 30);
  pdf.text('Total Deductions', 18, y);
  pdf.text(fmtMoney(sl.total_deductions || 0), W - 18, y, { align: 'right' });
  y += 16;

  // ── Net pay banner ──
  pdf.setFillColor(dR, dG, dB);
  pdf.rect(14, y - 8, W - 28, 16, 'F');
  pdf.setFillColor(gR, gG, gB);
  pdf.rect(14, y - 8, 2.4, 16, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(12);
  pdf.setFont(F, 'bold');
  pdf.text('NET PAY', 20, y + 1.5);
  pdf.setFontSize(13.5);
  pdf.text(fmtMoney(sl.net_pay || 0), W - 20, y + 1.5, { align: 'right' });
  y += 24;

  if (sl.bank_name || sl.bank_account_number) {
    pdf.setFillColor(250, 248, 245);
    pdf.rect(14, y - 6, W - 28, 16, 'F');
    pdf.setDrawColor(225, 215, 205);
    pdf.rect(14, y - 6, W - 28, 16, 'S');
    pdf.setTextColor(dR, dG, dB);
    pdf.setFontSize(7.5);
    pdf.setFont(F, 'bold');
    pdf.text('PAYMENT DETAILS', 19, y);
    y += 6;
    pdf.setFont(F, 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(60, 60, 60);
    pdf.text(`${sl.bank_name || '—'}   ·   ${sl.bank_account_name || '—'}   ·   ${sl.bank_account_number || '—'}`, 19, y);
    y += 14;
  } else {
    y += 4;
  }

  // ── Footer ──
  pdf.setDrawColor(gR, gG, gB);
  pdf.setLineWidth(0.6);
  pdf.line(14, H - 20, W - 14, H - 20);
  pdf.setFontSize(7);
  pdf.setFont(F, 'normal');
  pdf.setTextColor(140, 140, 140);
  pdf.text('This is a computer-generated payslip and does not require a signature.', W / 2, H - 15, { align: 'center' });
  pdf.setFontSize(6.3);
  pdf.setTextColor(180, 180, 180);
  pdf.text((SS.school_name || 'School') + ' Payroll System  ·  Generated ' + new Date().toLocaleDateString('en-GB'), W / 2, H - 11, { align: 'center' });

  pdf.save(`Payslip_${(sl.staff_name || 'staff').replace(/\s+/g, '_')}_${sl.period}.pdf`);
}
