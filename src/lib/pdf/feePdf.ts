import { jsPDF } from 'jspdf';
import { NAIRA_FONT_REGULAR_B64, NAIRA_FONT_BOLD_B64 } from './nairaFont';

export interface SchoolSettingsForPdf {
  school_name?: string;
  address?: string;
  phone1?: string;
  email?: string;
  finance_signatory_name?: string;
  finance_signatory_role?: string;
}

export interface StudentForPdf {
  full_name?: string;
  admission_number?: string;
  class_name?: string;
}

export interface FeeLine {
  fee_name?: string;
  description?: string;
  fee_type?: string;
  amount?: string | number;
  amount_paid?: string | number;
  paid_at?: string;
  payment_method?: string;
}

// Same VFS-registration-per-instance as window._ensureNairaFont() — jsPDF
// keeps fonts per document, so this has to run again for every new jsPDF().
export function ensureNairaFont(pdf: jsPDF) {
  pdf.addFileToVFS('DejaVuSans.ttf', NAIRA_FONT_REGULAR_B64);
  pdf.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
  pdf.addFileToVFS('DejaVuSans-Bold.ttf', NAIRA_FONT_BOLD_B64);
  pdf.addFont('DejaVuSans-Bold.ttf', 'DejaVuSans', 'bold');
  pdf.setFont('DejaVuSans', 'normal');
}

/** Loads a remote image into a data URL jsPDF's addImage() can consume. */
export async function loadImageForPdf(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function drawHeader(pdf: jsPDF, SS: SchoolSettingsForPdf, logoImg: string | null, title: string) {
  const W = 210;
  pdf.setFillColor(93, 64, 55); pdf.rect(0, 0, W, 28, 'F');
  pdf.setFillColor(201, 162, 75); pdf.rect(0, 28, W, 1, 'F');
  if (logoImg) { try { pdf.addImage(logoImg, 'JPEG', 8, 4, 18, 18, undefined, 'FAST'); } catch { /* ignore */ } }
  pdf.setTextColor(255, 255, 255); pdf.setFontSize(12); pdf.setFont('DejaVuSans', 'bold');
  pdf.text((SS.school_name || 'School').toUpperCase(), W / 2, 10, { align: 'center' });
  pdf.setFontSize(7); pdf.setFont('DejaVuSans', 'normal');
  pdf.text(SS.address || '', W / 2, 16, { align: 'center' });
  pdf.text((SS.phone1 || '') + (SS.email ? ' | ' + SS.email : ''), W / 2, 21, { align: 'center' });

  let y = 34;
  pdf.setTextColor(0, 0, 0); pdf.setFontSize(12); pdf.setFont('DejaVuSans', 'bold');
  pdf.text(title, W / 2, y, { align: 'center' });
  pdf.setDrawColor(93, 64, 55); pdf.setLineWidth(0.5); pdf.line(15, y + 3, W - 15, y + 3);
  return y + 10;
}

function drawSignature(pdf: jsPDF, SS: SchoolSettingsForPdf, y: number) {
  const W = 210, ML = 15;
  const sigName = SS.finance_signatory_name || 'School Director';
  const sigRole = SS.finance_signatory_role || 'School Director';
  pdf.setDrawColor(150, 150, 150); pdf.setLineWidth(0.4); pdf.line(ML, y, ML + 55, y);
  pdf.setFont('DejaVuSans', 'bold'); pdf.setTextColor(0, 0, 0); pdf.setFontSize(9);
  pdf.text(sigName, ML, y + 5);
  pdf.setFont('DejaVuSans', 'normal'); pdf.setFontSize(8); pdf.setTextColor(80, 80, 80);
  pdf.text(sigRole + ' \u2014 ' + new Date().toLocaleDateString('en-GB'), ML, y + 10);
  pdf.setFontSize(7); pdf.setTextColor(150, 150, 150);
  pdf.text('Computer-generated document.', W / 2, y + 18, { align: 'center' });
}

/** Ported from _buildInvoicePDF() (index.html ~25148-25196). */
export function buildInvoicePDF(
  stu: StudentForPdf | null,
  filtered: FeeLine[],
  session: string,
  term: string,
  SS: SchoolSettingsForPdf,
  logoImg: string | null
): jsPDF {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  ensureNairaFont(pdf);
  const W = 210, ML = 15;
  let y = drawHeader(pdf, SS, logoImg, 'FEE INVOICE');

  pdf.setFontSize(9); pdf.setFont('DejaVuSans', 'normal');
  pdf.text('Student: ' + (stu?.full_name || '\u2014'), ML, y);
  pdf.text('Adm No: ' + (stu?.admission_number || '\u2014'), W / 2, y); y += 6;
  pdf.text('Class: ' + (stu?.class_name || '\u2014'), ML, y);
  pdf.text('Session: ' + (session || '\u2014') + ' | Term: ' + (term || '\u2014'), W / 2, y); y += 10;

  pdf.setFillColor(93, 64, 55); pdf.rect(ML, y, W - ML * 2, 9, 'F');
  pdf.setTextColor(255, 255, 255); pdf.setFont('DejaVuSans', 'bold'); pdf.setFontSize(9);
  pdf.text('Fee Description', ML + 5, y + 6);
  pdf.text('Amount (\u20a6)', W - ML, y + 6, { align: 'right' }); y += 9;

  let total = 0;
  const items = filtered.length ? filtered : [{ fee_name: 'No fees assigned', amount: 0 }];
  items.forEach((fa, i) => {
    pdf.setFillColor(i % 2 === 0 ? 255 : 248, i % 2 === 0 ? 255 : 248, i % 2 === 0 ? 255 : 248);
    pdf.rect(ML, y, W - ML * 2, 9, 'F');
    pdf.setTextColor(0, 0, 0); pdf.setFont('DejaVuSans', 'normal'); pdf.setFontSize(9);
    pdf.text((fa.fee_name || fa.description || fa.fee_type || 'Fee').substring(0, 40), ML + 5, y + 6);
    pdf.text((parseFloat(String(fa.amount)) || 0).toLocaleString(), W - ML, y + 6, { align: 'right' });
    total += parseFloat(String(fa.amount)) || 0; y += 9;
  });

  pdf.setFillColor(93, 64, 55); pdf.rect(ML, y, W - ML * 2, 10, 'F');
  pdf.setTextColor(255, 255, 255); pdf.setFont('DejaVuSans', 'bold'); pdf.setFontSize(10);
  pdf.text('TOTAL', ML + 5, y + 7);
  pdf.text('\u20a6' + total.toLocaleString(), W - ML, y + 7, { align: 'right' }); y += 18;

  drawSignature(pdf, SS, y);
  return pdf;
}

/** Ported from _buildReceiptPDF() (index.html ~25198-25288). */
export function buildReceiptPDF(
  stu: StudentForPdf | null,
  filtered: FeeLine[],
  session: string,
  term: string,
  SS: SchoolSettingsForPdf,
  logoImg: string | null
): jsPDF {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  ensureNairaFont(pdf);
  const W = 210, ML = 15;
  let y = drawHeader(pdf, SS, logoImg, 'PAYMENT RECEIPT');

  pdf.setFontSize(9); pdf.setFont('DejaVuSans', 'normal');
  pdf.text('Student: ' + (stu?.full_name || '\u2014'), ML, y);
  pdf.text('Adm No: ' + (stu?.admission_number || '\u2014'), W / 2, y); y += 6;
  pdf.text('Class: ' + (stu?.class_name || '\u2014'), ML, y);
  pdf.text('Session: ' + (session || '\u2014') + ' | Term: ' + (term || '\u2014'), W / 2, y); y += 10;

  pdf.setFillColor(93, 64, 55); pdf.rect(ML, y, W - ML * 2, 9, 'F');
  pdf.setTextColor(255, 255, 255); pdf.setFont('DejaVuSans', 'bold'); pdf.setFontSize(9);
  const amtX = W - ML * 2 - 2;
  pdf.text('Description', ML + 5, y + 6); pdf.text('Date', 95, y + 6);
  pdf.text('Method', 135, y + 6); pdf.text('Amount (\u20a6)', amtX, y + 6, { align: 'right' }); y += 9;

  let total = 0;
  const items = filtered.length ? filtered : [{ description: 'No payments recorded', amount_paid: 0, paid_at: '', payment_method: '' }];
  items.forEach((fp, i) => {
    pdf.setFillColor(i % 2 === 0 ? 255 : 248, i % 2 === 0 ? 255 : 248, i % 2 === 0 ? 255 : 248);
    pdf.rect(ML, y, W - ML * 2, 9, 'F');
    pdf.setTextColor(0, 0, 0); pdf.setFont('DejaVuSans', 'normal'); pdf.setFontSize(8.5);
    pdf.text((fp.description || fp.fee_name || fp.fee_type || 'Payment').substring(0, 28), ML + 5, y + 6);
    pdf.text(fp.paid_at ? new Date(fp.paid_at).toLocaleDateString('en-GB') : '\u2014', 95, y + 6);
    pdf.text(fp.payment_method || '\u2014', 135, y + 6);
    pdf.text('\u20a6' + (parseFloat(String(fp.amount_paid)) || 0).toLocaleString('en-NG'), amtX, y + 6, { align: 'right' });
    total += parseFloat(String(fp.amount_paid)) || 0; y += 9;
  });

  pdf.setFillColor(22, 163, 74); pdf.rect(ML, y, W - ML * 2, 10, 'F');
  pdf.setTextColor(255, 255, 255); pdf.setFont('DejaVuSans', 'bold'); pdf.setFontSize(10);
  pdf.text('TOTAL PAID', ML + 5, y + 7);
  pdf.text('\u20a6' + total.toLocaleString('en-NG'), amtX, y + 7, { align: 'right' }); y += 14;

  // Fee Summary block (index.html ~25255-25278)
  const totalFee = items.reduce((s, fp) => s + (parseFloat(String(fp.amount)) || 0), 0);
  const totalBal = Math.max(0, totalFee - total);
  if (totalFee > 0) {
    pdf.setDrawColor(210, 210, 210); pdf.setLineWidth(0.25); pdf.line(ML, y, W - ML, y); y += 5;
    const lx = ML + 4, rx = amtX;
    pdf.setFontSize(8.5); pdf.setFont('DejaVuSans', 'normal'); pdf.setTextColor(60, 60, 60);
    pdf.text('Total Fee Charged:', lx, y);
    pdf.text('\u20a6' + totalFee.toLocaleString('en-NG'), rx, y, { align: 'right' }); y += 6;
    pdf.text('Total Amount Paid:', lx, y);
    pdf.text('\u20a6' + total.toLocaleString('en-NG'), rx, y, { align: 'right' }); y += 6;
    if (totalBal > 0) {
      pdf.setFont('DejaVuSans', 'bold'); pdf.setTextColor(220, 38, 38);
      pdf.text('Outstanding Balance:', lx, y);
      pdf.text('\u20a6' + totalBal.toLocaleString('en-NG'), rx, y, { align: 'right' }); y += 6;
      pdf.setFont('DejaVuSans', 'normal'); pdf.setFontSize(8); pdf.setTextColor(100, 100, 100);
      pdf.text('Partial payment \u2014 remaining balance must be settled before deadline.', lx, y); y += 6;
    } else {
      pdf.setFont('DejaVuSans', 'bold'); pdf.setTextColor(22, 163, 74);
      pdf.text('Outstanding Balance: NIL \u2014 Account Fully Cleared \u2713', lx, y); y += 6;
    }
    pdf.setTextColor(0, 0, 0); pdf.setFont('DejaVuSans', 'normal');
    y += 4;
  } else { y += 4; }

  drawSignature(pdf, SS, y);
  return pdf;
}
