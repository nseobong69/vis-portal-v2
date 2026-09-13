import { ensureNairaFont } from './nairaFont';

// ═══════════════════════════════════════════════════════════════════════════
// AI CHAT — FILE GENERATION. Ported from _aiGenerateDocx()/_aiGeneratePdf()/
// _aiGenerateHtml() (index.html ~L29976-30175). All three take the raw
// markdown-ish text of an AI reply and produce a real downloadable file,
// client-side, no server round trip — same as the old app.
//
// NEW DEPENDENCY: docx generation needs JSZip (the old app loaded it from
// a CDN at runtime via _ensureJSZip() — this app installs real packages
// instead, same choice already made for jspdf/html2canvas/qrcode). Add:
//   npm i jszip
// ═══════════════════════════════════════════════════════════════════════════

function xmlEscape(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function triggerDownload(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Mirrors _aiGenerateDocx(text) — a real, minimal .docx built by hand
 *  (Content_Types/rels/document.xml/styles.xml), not a library like
 *  docx.js — same approach the old app used. */
export async function generateDocx(text: string): Promise<void> {
  const JSZip = (await import('jszip')).default;

  let body = '';
  const lines = text.split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      body += '<w:p/>';
      continue;
    }
    if (/^###?\s/.test(line)) {
      const lvl = line.startsWith('###') ? 'Heading3' : 'Heading2';
      const t = xmlEscape(line.replace(/^#{2,3}\s+/, ''));
      body += `<w:p><w:pPr><w:pStyle w:val="${lvl}"/></w:pPr><w:r><w:t>${t}</w:t></w:r></w:p>`;
    } else if (/^#\s/.test(line)) {
      const t = xmlEscape(line.replace(/^#\s+/, ''));
      body += `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${t}</w:t></w:r></w:p>`;
    } else {
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      let runs = '';
      for (const p of parts) {
        if (!p) continue;
        if (/^\*\*(.+)\*\*$/.test(p)) {
          runs += `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${xmlEscape(p.slice(2, -2))}</w:t></w:r>`;
        } else {
          runs += `<w:r><w:t xml:space="preserve">${xmlEscape(p)}</w:t></w:r>`;
        }
      }
      body += `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>${runs}</w:p>`;
    }
  }
  body += '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>';

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml"   ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr><w:sz w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="280" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="5D4037"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="30"/><w:color w:val="1A237E"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="160" w:after="60"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="333333"/></w:rPr>
  </w:style>
</w:styles>`;

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body}</w:body>
</w:document>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', rels);
  zip.file('word/document.xml', docXml);
  zip.file('word/_rels/document.xml.rels', docRels);
  zip.file('word/styles.xml', styles);

  const blob: Blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  triggerDownload(blob, `AI_Response_${Date.now()}.docx`);
}

/** Mirrors _aiGeneratePdf(text) — plain multi-page A4 text layout via
 *  jsPDF, reusing the same Naira-capable font Batch 5's payslip PDF
 *  uses (so any ₦ the AI includes in a reply renders correctly here too). */
export async function generatePdf(text: string): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  ensureNairaFont(doc);
  doc.setFont('DejaVuSans', 'normal');
  const pageH = 280,
    margin = 15,
    lineH = 6;
  let y = margin;
  const lines = text.split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      y += lineH * 0.5;
      continue;
    }
    if (/^#{1,3}\s+/.test(line)) {
      const lvl = (line.match(/^(#+)/) || [''])[0].length;
      const t = line.replace(/^#+\s+/, '');
      doc.setFontSize(lvl === 1 ? 16 : lvl === 2 ? 13 : 11);
      doc.setFont('DejaVuSans', 'bold');
      const wrapped: string[] = doc.splitTextToSize(t, 180);
      wrapped.forEach((wl) => {
        if (y > pageH) {
          doc.addPage();
          y = margin;
        }
        doc.text(wl, margin, y);
        y += lineH + (lvl === 1 ? 3 : 1);
      });
      doc.setFont('DejaVuSans', 'normal');
      doc.setFontSize(11);
    } else {
      const clean = line.replace(/\*\*/g, '');
      const wrapped: string[] = doc.splitTextToSize(clean, 180);
      doc.setFontSize(11);
      wrapped.forEach((wl) => {
        if (y > pageH) {
          doc.addPage();
          y = margin;
        }
        doc.text(wl, margin, y);
        y += lineH;
      });
    }
  }
  doc.save(`AI_Response_${Date.now()}.pdf`);
}

/** Mirrors _aiGenerateHtml(text) — a small, self-contained styled HTML
 *  file, no dependencies. */
export function generateHtml(text: string): void {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .replace(/^[-*•] (.+)$/gm, '<li>$2</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  const full = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI Response</title>
<style>
  body{font-family:'Segoe UI',Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 24px;
       color:#1a1a2e;line-height:1.8;font-size:15px;}
  h1{color:#5D4037;border-bottom:2px solid #5D4037;padding-bottom:6px;}
  h2{color:#1A237E;margin-top:28px;}
  h3{color:#333;margin-top:20px;}
  p{margin:10px 0;} li{margin:4px 0;}
  strong{color:#1a1a1a;}
</style>
</head>
<body><p>${html}</p></body>
</html>`;
  triggerDownload(new Blob([full], { type: 'text/html' }), `AI_Response_${Date.now()}.html`);
}

/** Mirrors _aiDownloadFromHistory()'s dispatch. */
export async function downloadAiReply(text: string, format: 'docx' | 'pdf' | 'html'): Promise<void> {
  if (format === 'docx') return generateDocx(text);
  if (format === 'pdf') return generatePdf(text);
  return generateHtml(text);
}
