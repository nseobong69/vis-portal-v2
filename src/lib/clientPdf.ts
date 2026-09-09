import { buildResultSheet, ordinal, type BuildResultSheetArgs } from './resultCard';
import type { CombinedPdfStudentPayload } from './combinedPdf';

// ═══════════════════════════════════════════════════════════════════════════
// Browser-only PDF assembly. Ported from the old app's downloadResultPDF()
// and generateCombinedPDF() (index.html L10215-10480) — same off-DOM 794px
// container width (guarantees full-page A4 output regardless of the actual
// viewport), same html2canvas scale/quality settings, same margin/centering
// math for fitting the rasterised card onto an A4 page.
//
// One deliberate change from the old app: QR codes are generated with the
// `qrcode` npm package (toDataURL) instead of the old DOM-based qrcodejs
// widget-then-read-the-canvas dance — same end result (a data: URL for the
// <img> in the template) with no injected off-screen DOM element or paint-
// timing race to work around.
// ═══════════════════════════════════════════════════════════════════════════

const CARD_WIDTH_PX = 794; // A4 @ 96dpi width — matches the old app's tempDiv
const RENDER_SCALE = 3.5; // matches the old app's html2canvas scale
const JPEG_QUALITY = 0.94;
const PAGE_MARGIN_MM = 6;

async function loadLibs() {
  const [{ jsPDF }, html2canvasMod] = await Promise.all([import('jspdf'), import('html2canvas')]);
  return { jsPDF, html2canvas: html2canvasMod.default };
}

/** Mirrors _genResultQR/_resultQRUrl — builds the scan-to-verify QR data URL. */
export async function genResultQRDataUrl(pin: string, sizePx = 260): Promise<string> {
  try {
    const QRCode = (await import('qrcode')).default;
    const portalBase = window.location.origin + window.location.pathname;
    const url = pin ? `${portalBase}?scan=1&pin=${encodeURIComponent(pin)}` : `${portalBase}?checkresult=1`;
    return await QRCode.toDataURL(url, { width: sizePx, margin: 1, errorCorrectionLevel: 'L' });
  } catch {
    return '';
  }
}

/** Renders one result-sheet HTML string into an off-DOM 794px container and
 *  rasterises it with html2canvas. Returns the JPEG data URL + canvas size. */
async function rasteriseCard(html2canvas: any, html: string) {
  const tempDiv = document.createElement('div');
  tempDiv.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:794px;background:#fff;';
  document.body.appendChild(tempDiv);
  tempDiv.innerHTML = html;
  await new Promise((r) => setTimeout(r, 60)); // let images/layout paint before capture

  const canvas = await html2canvas(tempDiv, {
    scale: RENDER_SCALE,
    useCORS: true,
    logging: false,
    width: CARD_WIDTH_PX,
    allowTaint: false,
    backgroundColor: '#ffffff',
  });
  document.body.removeChild(tempDiv);
  return { imgData: canvas.toDataURL('image/jpeg', JPEG_QUALITY), width: canvas.width, height: canvas.height };
}

/** Places a rasterised card image onto the current jsPDF page, centered and
 *  scaled to fit within the page margins — same math as the old app. */
function placeOnPage(pdf: any, imgData: string, canvasW: number, canvasH: number) {
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const usableW = W - PAGE_MARGIN_MM * 2;
  const usableH = H - PAGE_MARGIN_MM * 2;
  const imgH = (canvasH * usableW) / canvasW;
  let fW = usableW,
    fH = imgH,
    fx = PAGE_MARGIN_MM,
    fy = PAGE_MARGIN_MM;
  if (imgH > usableH) {
    fH = usableH;
    fW = (canvasW * usableH) / canvasH;
    fx = PAGE_MARGIN_MM + (usableW - fW) / 2;
  } else {
    fy = PAGE_MARGIN_MM + (usableH - fH) / 2;
  }
  pdf.addImage(imgData, 'JPEG', fx, fy, fW, fH);
}

export interface SingleResultPdfArgs extends Omit<BuildResultSheetArgs, 'forPDF' | 'ordinal'> {
  admissionNumber: string;
  term: string;
  sess: string;
}

/** Mirrors downloadResultPDF() — single-student "My Results" download. */
export async function downloadResultPDF(args: SingleResultPdfArgs): Promise<Blob> {
  const { jsPDF, html2canvas } = await loadLibs();
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const html = buildResultSheet({ ...args, ordinal, forPDF: true });
  const { imgData, width, height } = await rasteriseCard(html2canvas, html);
  placeOnPage(pdf, imgData, width, height);
  pdf.save(`VIS_Result_${args.admissionNumber}_${args.term}_${args.sess}.pdf`);
  return pdf.output('blob');
}

export interface CombinedPdfProgress {
  index: number;
  total: number;
  studentName: string;
}

/**
 * Mirrors generateCombinedPDF()'s rasterisation loop (index.html
 * L10391-4374) — one A4 page per student, in class order, no page-count
 * footer (each card's own footer band is the page baseline, same as the
 * old app). Data pre-fetch/permission-checks already happened server-side
 * via fetchCombinedPdfData(); this function only builds & saves the PDF.
 */
export async function generateCombinedPdf(
  className: string,
  students: CombinedPdfStudentPayload[],
  term: string,
  session: string,
  schoolSettings: Record<string, any>,
  onProgress?: (p: CombinedPdfProgress) => void
): Promise<void> {
  const { jsPDF, html2canvas } = await loadLibs();
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const genDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  for (let i = 0; i < students.length; i++) {
    const sp = students[i];
    onProgress?.({ index: i + 1, total: students.length, studentName: sp.student.full_name });

    const qrDataUrl = await genResultQRDataUrl(sp.qrPin);
    const classCount = students.length;
    const myLabel = /kindergarten|nursery|primary|kinder|nurs|prim/i.test(sp.student.class_name || '') ? 'Pupil' : 'Student';

    const html = buildResultSheet({
      results: sp.results,
      grand: sp.grand,
      totalObtainable: sp.totalObtainable,
      avg: sp.avg,
      pos: sp.pos,
      ordinal,
      tcComment: sp.tcComment,
      pcComment: sp.pcComment,
      genDate,
      pf: sp.pf,
      pfColor: sp.pfColor,
      SS: schoolSettings,
      myLabel,
      classCount,
      traits: sp.traits,
      term,
      sess: session,
      student: sp.student,
      qrPin: sp.qrPin,
      classSigData: sp.classSigData,
      qrDataUrl,
      forPDF: true,
    });

    const { imgData, width, height } = await rasteriseCard(html2canvas, html);
    if (i > 0) pdf.addPage();
    placeOnPage(pdf, imgData, width, height);
  }

  pdf.save(`VIS_Combined_Results_${className}_${term}_${session}.pdf`);
}
