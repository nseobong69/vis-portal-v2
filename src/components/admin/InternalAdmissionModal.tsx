import { useEffect, useRef, useState } from 'react';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { createBrowserSupabase } from '../../lib/supabase';

// ── Location picker APIs — same as old app (index.html ~L21398-21570) ──
const _CNOW = 'https://countriesnow.space/api/v0.1';
const _NGA_LGA = 'https://nga-states-lga.onrender.com/api';
const _locCache: { countries: string[] | null; states: Record<string, string[]>; lgas: Record<string, string[]> } = {
  countries: null, states: {}, lgas: {},
};
const _NG_STATES = [
  'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
  'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','Federal Capital Territory',
  'Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara',
  'Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers',
  'Sokoto','Taraba','Yobe','Zamfara',
];

async function _getCountries(): Promise<string[]> {
  if (_locCache.countries) return _locCache.countries;
  try {
    const r = await fetch(`${_CNOW}/countries`, { cache: 'force-cache' });
    const d = await r.json();
    _locCache.countries = ((d.data || []) as { country: string }[])
      .map((c) => c.country)
      .sort((a, b) => (a === 'Nigeria' ? -1 : b === 'Nigeria' ? 1 : a.localeCompare(b)));
  } catch {
    _locCache.countries = ['Nigeria','Ghana','South Africa','Kenya','United Kingdom','United States','Canada'];
  }
  return _locCache.countries!;
}

async function _getStates(country: string): Promise<string[]> {
  if (_locCache.states[country]) return _locCache.states[country];
  try {
    const r = await fetch(`${_CNOW}/countries/states`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country }),
    });
    const d = await r.json();
    let list = ((d.data?.states || []) as { name: string }[]).map((s) => s.name).sort();
    if (!list.length && country === 'Nigeria') list = [..._NG_STATES];
    _locCache.states[country] = list;
  } catch {
    _locCache.states[country] = country === 'Nigeria' ? [..._NG_STATES] : [];
  }
  return _locCache.states[country];
}

async function _getLGAs(country: string, state: string): Promise<string[]> {
  const key = country + '||' + state;
  if (_locCache.lgas[key]) return _locCache.lgas[key];
  if (country === 'Nigeria') {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 8000);
      let lgas: string[] = [];
      try {
        const r = await fetch(`${_NGA_LGA}?state=${encodeURIComponent(state)}`, { signal: ctrl.signal });
        clearTimeout(tid);
        if (r.ok) {
          const d = await r.json();
          if (Array.isArray(d)) lgas = d;
          else if (Array.isArray(d?.lgas)) lgas = d.lgas;
          else if (Array.isArray(d?.data)) lgas = d.data;
          else {
            const arr = Object.values(d).find((v) => Array.isArray(v) && (v as any[]).length > 0) as any[] | undefined;
            if (arr) lgas = arr;
          }
        }
      } catch { clearTimeout(tid); }
      if (lgas.length) {
        _locCache.lgas[key] = lgas.map((l) => (typeof l === 'string' ? l : (l as any).name || (l as any).lga_name || '')).filter(Boolean).sort();
      } else {
        const r2 = await fetch(`${_CNOW}/countries/state/cities`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ country, state }),
        });
        const d2 = await r2.json();
        _locCache.lgas[key] = ((d2.data || []) as string[]).sort();
      }
    } catch { _locCache.lgas[key] = []; }
  } else {
    try {
      const r = await fetch(`${_CNOW}/countries/state/cities`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country, state }),
      });
      const d = await r.json();
      _locCache.lgas[key] = ((d.data || []) as string[]).sort();
    } catch { _locCache.lgas[key] = []; }
  }
  return _locCache.lgas[key];
}

// ── jsPDF lazy-loader (mirrors old app's _ensureJsPDF) ──────────────────
async function ensureJsPDF(): Promise<typeof window.jspdf> {
  if ((window as any).jspdf) return (window as any).jspdf;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('jsPDF failed to load'));
    document.head.appendChild(s);
  });
  return (window as any).jspdf;
}

// ── PDF generation — 3-page port of generateAdmissionPDF() ──────────────
async function generateAdmissionPDF(adm: Record<string, any>) {
  const { jsPDF } = await ensureJsPDF();
  const supabase = createBrowserSupabase();
  const { data: ss } = await supabase.from('school_settings').select('*').eq('id', 1).single();
  const SS: Record<string, any> = ss || {};
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210;
  const admNum = adm.admission_number || ('VIS/ADM/' + new Date().getFullYear() + '/' + Date.now().toString().slice(-4));
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const schoolName = SS.school_name || 'Victorious International Schools';
  const motto = SS.motto || 'Wisdom, Knowledge and Success';
  const address = SS.address || 'Okpok-Ikpa Okoyong, Odukpani LGA, Cross River State, Nigeria';
  const admSigName = SS.admission_signatory_name || SS.school_director_name || 'VIS Administrator';
  const admSigRole = SS.admission_signatory_role || SS.school_director_title || 'School Director';
  const admSigImg = SS.admission_signatory_signature || SS.school_director_signature || null;
  const admStampImg = SS.admission_signatory_stamp || SS.school_director_stamp || null;

  async function loadImg(url: string): Promise<string> {
    return new Promise((res, rej) => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d')!;
        const isPNG = url.toLowerCase().includes('.png') || url.startsWith('data:image/png');
        if (!isPNG) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
        ctx.drawImage(img, 0, 0);
        res(isPNG ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = rej; img.src = url;
    });
  }

  async function addLetterhead(pageNum: number): Promise<number> {
    if (pageNum > 1) pdf.addPage();
    pdf.setFillColor(93, 64, 55); pdf.rect(0, 0, W, 30, 'F');
    pdf.setFillColor(201, 162, 75); pdf.rect(0, 30, W, 1, 'F');
    if (SS.logo_url) {
      try { const img = await loadImg(SS.logo_url); pdf.addImage(img, 'JPEG', 8, 4, 22, 22); } catch { /* skip */ }
    }
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(15); pdf.setFont('helvetica', 'bold'); pdf.text(schoolName.toUpperCase(), W / 2, 11, { align: 'center' });
    pdf.setFontSize(8); pdf.setFont('helvetica', 'italic'); pdf.text(`"${motto}"`, W / 2, 17, { align: 'center' });
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5);
    pdf.text(address + (SS.phone1 ? ' | ' + SS.phone1 : '') + (SS.email ? ' | ' + SS.email : ''), W / 2, 23, { align: 'center' });
    pdf.setTextColor(0, 0, 0);
    return 34;
  }

  // ── PAGE 1: Admission Offer Letter ──
  let y = await addLetterhead(1);
  pdf.setFontSize(8.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(80, 80, 80);
  pdf.text('Ref: ' + admNum, 15, y + 4);
  pdf.text('Date: ' + today, W - 15, y + 4, { align: 'right' });
  y += 10;
  pdf.setFontSize(13); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0);
  pdf.text('ADMISSION OFFER LETTER', W / 2, y + 4, { align: 'center' });
  pdf.setDrawColor(93, 64, 55); pdf.setLineWidth(0.5); pdf.line(30, y + 7, W - 30, y + 7);
  y += 13;
  pdf.setFontSize(10); pdf.setFont('helvetica', 'normal');
  pdf.text('To: ' + (adm.parent_name || 'Parent/Guardian'), 15, y + 2); y += 9;
  const cName = adm.full_name || '—';
  const clsAdm = adm.class_admitted || adm.class_applied || '—';
  const sess = adm.session || SS.current_session || '';
  pdf.setFontSize(10.5); pdf.text(`Dear Mr./Mrs. ${adm.parent_name || 'Parent/Guardian'},`, 15, y); y += 8;
  const b1 = 'We are pleased to inform you that your child, ';
  pdf.text(b1, 15, y); pdf.setFont('helvetica', 'bold'); pdf.text(cName + ',', 15 + pdf.getTextWidth(b1), y);
  pdf.setFont('helvetica', 'normal'); y += 6;
  const b2 = 'has been offered provisional admission into ';
  pdf.text(b2, 15, y); pdf.setFont('helvetica', 'bold'); pdf.text(clsAdm, 15 + pdf.getTextWidth(b2), y);
  pdf.setFont('helvetica', 'normal');
  pdf.text(` for`, 15 + pdf.getTextWidth(b2 + clsAdm), y); y += 6;
  pdf.text(`the ${sess} academic year.`, 15, y); y += 10;
  // Details box
  pdf.setFillColor(248, 248, 248); pdf.setDrawColor(200, 200, 200); pdf.setLineWidth(0.4);
  pdf.roundedRect(15, y, W - 30, 36, 3, 3, 'FD');
  pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(93, 64, 55);
  pdf.text('ADMISSION DETAILS', 20, y + 7);
  pdf.setFont('helvetica', 'normal'); pdf.setTextColor(0, 0, 0);
  let dy = y + 13;
  [['Student Full Name:', cName], ['Gender:', adm.gender || '—'], ['Class Applied:', adm.class_applied || '—'], ['Class Admitted Into:', clsAdm], ['Date of Admission:', today]].forEach(([k, v]) => {
    pdf.setFont('helvetica', 'bold'); pdf.text(k, 20, dy); pdf.text(v, 75, dy); dy += 5;
  });
  y += 42;
  // Instructions
  pdf.setFontSize(9.5); pdf.setFont('helvetica', 'bold'); pdf.text('Instructions — Please note the following:', 15, y); y += 6;
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
  ['Payment of all outstanding fees is required before resumption.', 'Submission of required documents (birth certificate, passport photos, previous result).', 'The school has already resumed. Bring your child to school immediately or as soon as possible.', 'Present this letter to the school on resumption.'].forEach((line) => {
    const wrapped = pdf.splitTextToSize('• ' + line, W - 30);
    pdf.text(wrapped, 15, y); y += wrapped.length * 5 + 1;
  });
  y += 6;
  // Congrats box
  pdf.setFillColor(245, 253, 245); pdf.setDrawColor(180, 220, 180); pdf.roundedRect(15, y, W - 30, 28, 3, 3, 'FD');
  pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(22, 101, 52);
  pdf.text('CONGRATULATIONS!', W / 2, y + 7, { align: 'center' });
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(40, 40, 40);
  pdf.text(`Dear ${adm.gender === 'Female' ? 'Miss' : 'Master'} ${cName}, we are delighted to welcome you into the ${schoolName} family.`, W / 2, y + 13, { align: 'center' });
  pdf.text('We are committed to nurturing excellence, discipline, and character in every learner.', W / 2, y + 18, { align: 'center' });
  pdf.text('We look forward to a wonderful academic journey together.', W / 2, y + 23, { align: 'center' });
  y += 34;
  pdf.setTextColor(0, 0, 0); pdf.setFontSize(9.5);
  pdf.text('Once again, congratulations and welcome to ', 15, y); pdf.setFont('helvetica', 'bold');
  pdf.text(schoolName + '.', 15 + pdf.getTextWidth('Once again, congratulations and welcome to '), y);
  y += 9; pdf.setFont('helvetica', 'normal'); pdf.text('Yours faithfully,', 15, y); y += 16;
  // Signature block
  pdf.setDrawColor(150, 150, 150); pdf.line(15, y, 80, y);
  if (admSigImg) { try { const si = await loadImg(admSigImg); pdf.addImage(si, 'PNG', 15, y - 14, 40, 12); } catch { /* skip */ } }
  pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0); pdf.text(admSigName, 15, y + 5);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(80, 80, 80);
  pdf.text(admSigRole, 15, y + 10); pdf.text('For: ' + schoolName, 15, y + 15); pdf.text(today, 15, y + 20);
  if (admStampImg) { try { const si = await loadImg(admStampImg); pdf.addImage(si, 'PNG', W - 65, y - 4, 44, 36); } catch { _stampBox(pdf, W, y); } } else { _stampBox(pdf, W, y); }

  // ── PAGE 2: Completed Admission Form ──
  y = await addLetterhead(2);
  pdf.setFontSize(12); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0);
  pdf.text('ADMISSION FORM — COMPLETED COPY', W / 2, y + 6, { align: 'center' });
  pdf.setDrawColor(93, 64, 55); pdf.setLineWidth(0.5); pdf.line(15, y + 10, W - 15, y + 10); y += 16;
  const fields: [string, string][] = [
    ['Full Name', adm.full_name || '—'], ['Admission No', admNum],
    ['Gender', adm.gender || '—'], ['Date of Birth', adm.date_of_birth || '—'],
    ['Class Applied', adm.class_applied || '—'], ['Class Admitted', clsAdm],
    ['Nationality', adm.nationality || '—'], ['State of Origin', adm.state_of_origin || '—'],
    ['LGA', adm.lga || '—'], ['Religion', adm.religion || '—'],
    ['Denomination', adm.denomination || '—'], ['Village/Town', adm.village || '—'],
    ['Residential Address', adm.residential_address || '—'], ['Permanent Address', adm.permanent_address || '—'],
    ['Parents Married', adm.parents_married ? 'Yes' : 'No'], ['Parents Together', adm.parents_together ? 'Yes' : 'No'],
    ['Responsibility', adm.responsibility || '—'], ['Lives With', adm.lives_with || '—'],
    ['Emergency Contact', adm.emergency_name || '—'], ['Emergency Phone', adm.emergency_phone || '—'],
    ['Health Issues', adm.health_issues || 'Nil'], ['Disability', adm.disability || 'Nil'],
    ['Consent - Discipline', adm.consent_discipline ? 'Yes' : 'No'], ['Consent - Medical', adm.consent_medical ? 'Yes' : 'No'],
    ['Previous School', adm.previous_school || 'Nil'], ['Previous Class', adm.previous_class || '—'],
    ['Parent/Guardian', adm.parent_name || '—'], ['Phone', adm.phone || '—'],
    ['Email', adm.email || '—'], ['Parent Address', adm.parent_address || '—'],
    ['Amount Paid', 'NGN ' + (adm.amount_paid || 0).toLocaleString()], ['Payment Method', adm.payment_method || '—'],
    ['Admitted By', adm.official_name || SS.principal_name || 'VIS Administrator'], ['Date', today],
  ];
  pdf.setFontSize(8.5);
  let col = 0;
  for (const [k, v] of fields) {
    const x = col === 0 ? 15 : 108;
    pdf.setFont('helvetica', 'bold'); pdf.setTextColor(93, 64, 55); pdf.text(k + ':', x, y);
    pdf.setFont('helvetica', 'normal'); pdf.setTextColor(0, 0, 0); pdf.text(String(v || '—').substring(0, 36), x + 28, y);
    col = (col + 1) % 2;
    if (col === 0) y += 6.5;
    if (y > 270) { y = await addLetterhead((pdf as any).getNumberOfPages() + 1); y += 14; }
  }
  y += 12;
  pdf.setDrawColor(93, 64, 55); pdf.setLineWidth(0.4); pdf.line(15, y, W - 15, y);
  pdf.setFontSize(7.5); pdf.setTextColor(130, 130, 130);
  pdf.text('Official document of ' + schoolName + '. Generated: ' + today, W / 2, y + 5, { align: 'center' });
  y += 14;
  pdf.setDrawColor(150, 150, 150); pdf.line(15, y, 75, y);
  if (admSigImg) { try { const si = await loadImg(admSigImg); pdf.addImage(si, 'PNG', 15, y - 12, 40, 11); } catch { /* skip */ } }
  pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0); pdf.text(admSigName, 15, y + 4);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(80, 80, 80);
  pdf.text(admSigRole + ' · For: ' + schoolName, 15, y + 9); pdf.text(today, 15, y + 14);
  if (admStampImg) { try { const si = await loadImg(admStampImg); pdf.addImage(si, 'PNG', W - 62, y - 6, 42, 32); } catch { _stampBox(pdf, W, y); } } else { _stampBox(pdf, W, y); }

  // ── PAGE 3: Payment Receipt ──
  const hasPay = adm.amount_paid && adm.amount_paid > 0;
  if (hasPay) {
    y = await addLetterhead((pdf as any).getNumberOfPages() + 1);
    pdf.setFillColor(93, 64, 55); pdf.roundedRect(15, y, W - 30, 18, 3, 3, 'F');
    pdf.setFontSize(12); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(255, 255, 255);
    pdf.text('PAYMENT RECEIPT', W / 2, y + 11, { align: 'center' }); y += 24;
    const receiptNo = 'RCT/' + admNum.replace('/ADM', '').replace('/', '-').replace('/', '').slice(-8) + '/' + new Date().getFullYear();
    pdf.setFontSize(8.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(80, 80, 80);
    pdf.text('Receipt No: ' + receiptNo, 15, y); pdf.text('Date: ' + today, W - 15, y, { align: 'right' }); y += 8;
    pdf.setFillColor(248, 241, 227); pdf.setDrawColor(200, 180, 160); pdf.roundedRect(15, y, W - 30, 22, 3, 3, 'FD');
    pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(93, 64, 55);
    pdf.text('RECEIVED FROM:', 20, y + 7); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(0, 0, 0);
    pdf.text(adm.full_name || '—', 65, y + 7);
    pdf.setFont('helvetica', 'bold'); pdf.setTextColor(93, 64, 55);
    pdf.text('CLASS:', 20, y + 14); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(0, 0, 0);
    pdf.text(adm.class_applied || '—', 65, y + 14); y += 28;
    // Table header
    pdf.setFillColor(93, 64, 55); pdf.rect(15, y, W - 30, 9, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setTextColor(255, 255, 255); pdf.setFontSize(8.5);
    pdf.text('DESCRIPTION', 20, y + 6); pdf.text('AMOUNT', W - 20, y + 6, { align: 'right' }); y += 9;
    const fee = adm.admission_fee || 0;
    const paid = adm.amount_paid || 0;
    const bal = Math.max(0, fee - paid);
    pdf.setFillColor(255, 255, 255); pdf.rect(15, y, W - 30, 10, 'F');
    pdf.setFont('helvetica', 'normal'); pdf.setTextColor(0, 0, 0); pdf.setFontSize(9.5);
    pdf.text('Admission Fee — ' + (adm.class_admitted || adm.class_applied || ''), 20, y + 7);
    pdf.text('NGN ' + fee.toLocaleString(), W - 20, y + 7, { align: 'right' }); y += 10;
    pdf.setFillColor(240, 240, 240); pdf.rect(15, y, W - 30, 8, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(0, 0, 0);
    pdf.text('Total Billed:', 20, y + 5.5); pdf.text('NGN ' + fee.toLocaleString(), W - 20, y + 5.5, { align: 'right' }); y += 8;
    pdf.setFillColor(220, 252, 231); pdf.rect(15, y, W - 30, 9, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setTextColor(22, 101, 52);
    pdf.text('Amount Paid:', 20, y + 6); pdf.text('NGN ' + paid.toLocaleString(), W - 20, y + 6, { align: 'right' }); y += 9;
    if (bal > 0) {
      pdf.setFillColor(254, 243, 199); pdf.rect(15, y, W - 30, 9, 'F');
      pdf.setFont('helvetica', 'bold'); pdf.setTextColor(180, 83, 9);
      pdf.text('Balance Outstanding:', 20, y + 6); pdf.text('NGN ' + bal.toLocaleString(), W - 20, y + 6, { align: 'right' }); y += 9;
    }
    y += 6;
    pdf.setFont('helvetica', 'normal'); pdf.setTextColor(80, 80, 80); pdf.setFontSize(9);
    pdf.text('Payment Method: ' + (adm.payment_method || '—'), 15, y);
    if (adm.paystack_ref) { y += 5; pdf.text('Transaction Ref: ' + adm.paystack_ref, 15, y); }
    y += 12;
    if (adm.confirmed_by) {
      pdf.setFillColor(219, 234, 254); pdf.roundedRect(15, y, W - 30, 14, 2, 2, 'F');
      pdf.setFont('helvetica', 'italic'); pdf.setTextColor(37, 99, 235); pdf.setFontSize(9);
      pdf.text('Payment confirmed by: ' + adm.confirmed_by, W / 2, y + 8, { align: 'center' }); y += 20;
    }
    y += 6;
    pdf.setDrawColor(150, 150, 150); pdf.line(15, y, 80, y);
    if (admSigImg) { try { const si = await loadImg(admSigImg); pdf.addImage(si, 'PNG', 15, y - 12, 40, 11); } catch { /* skip */ } }
    pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0); pdf.setFontSize(9); pdf.text(admSigName, 15, y + 4);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(80, 80, 80);
    pdf.text(admSigRole + ' · For: ' + schoolName, 15, y + 9); pdf.text(today, 15, y + 14);
    if (admStampImg) { try { const si = await loadImg(admStampImg); pdf.addImage(si, 'PNG', W - 62, y - 6, 42, 30); } catch { _stampBox(pdf, W, y); } } else { _stampBox(pdf, W, y); }
    y += 28;
    pdf.setFontSize(7); pdf.setTextColor(150, 150, 150);
    pdf.text('This is a computer-generated receipt. Keep for your records.', W / 2, y + 5, { align: 'center' });
  }

  pdf.save('Admission_' + ((adm.full_name || 'student').replace(/\s+/g, '_')) + '_' + admNum + '.pdf');
}

function _stampBox(pdf: any, W: number, y: number) {
  pdf.setDrawColor(170, 170, 170); pdf.setLineWidth(0.3); pdf.setLineDashPattern([2, 2], 0);
  pdf.rect(W - 66, y - 8, 52, 28); pdf.setLineDashPattern([], 0);
  pdf.setFontSize(7); pdf.setTextColor(160, 160, 160);
  pdf.text('OFFICIAL STAMP', W - 66 + 52 / 2, y + 3, { align: 'center' });
}

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────

interface ClassOption { id: string; name: string; arm: string | null }

interface Props {
  classes: ClassOption[];
  feeDefault: number;
  feeSections: Record<string, number>;
  feeConfigs: Record<string, number>; // per-class ID override — new
  onClose: () => void;
  onCreated: () => void;
}

const STEPS = ['Basic', 'Biodata', 'Religion', 'Previous School', 'Parents', 'Health', 'Academic', 'Payment'];

function sectionKey(className: string): 'kindergarten' | 'nursery' | 'primary' | 'secondary' {
  const c = className.toLowerCase();
  if (/kindergarten|kinder|k\.g|kg\b/.test(c)) return 'kindergarten';
  if (/nursery|nur/.test(c)) return 'nursery';
  if (/primary|pri|pry/.test(c)) return 'primary';
  return 'secondary';
}

const field = 'w-full text-sm rounded-sm border border-brand-cream-dark px-3 py-2 bg-white';
const lbl = 'text-xs font-medium text-brand-brown-dark block mb-1';

export default function InternalAdmissionModal({ classes, feeDefault, feeSections, feeConfigs, onClose, onCreated }: Props) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Deduplicate by base name (same as old app buildAdmFormHTML())
  const seen = new Set<string>();
  const classOpts = classes.filter((c) => {
    const base = c.name.trim();
    if (seen.has(base)) return false;
    seen.add(base);
    return true;
  });

  const [f, setF] = useState<Record<string, any>>({
    full_name: '', class_id: '', class_applied: '',
    aptitude_code: '', aptitude_score: '',
    gender: 'Male', date_of_birth: '',
    nationality: 'Nigeria', state_of_origin: '', lga: '',
    village: '', permanent_address: '', religion: '', denomination: '', same_addr: false, residential_address: '',
    previous_school_choice: '', previous_class: '', last_promoted_class: '', previous_school: '',
    parent_name: '', parent_relationship: 'Father', parent_address: '', phone: '', email: '',
    parents_married: 'yes', parents_together: 'yes', responsibility: 'Parent', lives_with: 'Family',
    emergency_name: '', emergency_relationship: '', emergency_phone: '', emergency_address: '',
    health_issues_flag: 'no', health_issues: '', disability_flag: 'no', disability: '',
    consent_discipline: false, consent_medical: false,
    class_admitted: '',
    amount_paid: 0, payment_method: '', balance_due_date: '',
  });
  function set(k: string, v: any) { setF((prev) => ({ ...prev, [k]: v })); }

  // ── Location picker state ──
  const [countries, setCountries] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [lgas, setLGAs] = useState<string[]>([]);
  const [statesLoading, setStatesLoading] = useState(false);
  const [lgasLoading, setLGAsLoading] = useState(false);

  // Pre-load countries when hitting Biodata step
  const countriesLoaded = useRef(false);
  useEffect(() => {
    if (step === 1 && !countriesLoaded.current) {
      countriesLoaded.current = true;
      _getCountries().then(setCountries);
      // Pre-load Nigeria states since it's the default
      setStatesLoading(true);
      _getStates('Nigeria').then((s) => { setStates(s); setStatesLoading(false); });
    }
  }, [step]);

  async function onCountryChange(country: string) {
    set('nationality', country);
    set('state_of_origin', '');
    set('lga', '');
    setStates([]); setLGAs([]);
    if (!country) return;
    setStatesLoading(true);
    const s = await _getStates(country);
    setStates(s); setStatesLoading(false);
  }

  async function onStateChange(state: string) {
    set('state_of_origin', state);
    set('lga', '');
    setLGAs([]);
    if (!state) return;
    setLGAsLoading(true);
    const l = await _getLGAs(f.nationality || 'Nigeria', state);
    setLGAs(l); setLGAsLoading(false);
  }

  // ── 3-priority fee resolution: per-class ID → section → default ──
  const fee = (() => {
    if (f.class_id && feeConfigs[f.class_id] && parseFloat(String(feeConfigs[f.class_id])) > 0)
      return parseFloat(String(feeConfigs[f.class_id]));
    const sec = feeSections[sectionKey(f.class_applied)];
    return sec > 0 ? sec : feeDefault;
  })();
  const amtPaid = Number(f.amount_paid) || 0;
  const balance = Math.max(0, fee - amtPaid);

  function next() {
    if (step === 0 && (!f.full_name.trim() || !f.class_applied)) {
      setError('Full name and class are required.'); return;
    }
    setError(''); setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function back() { setStep((s) => Math.max(s - 1, 0)); }

  async function submit() {
    setSaving(true); setError('');
    try {
      const admission = {
        ...f,
        residential_address: f.same_addr ? f.permanent_address : f.residential_address,
        health_issues: f.health_issues_flag === 'yes' ? (f.health_issues.trim() || 'Yes') : null,
        disability: f.disability_flag === 'yes' ? (f.disability.trim() || 'Yes') : null,
        previous_school: f.previous_school_choice === 'other' ? f.previous_school : null,
        previous_class: f.previous_school_choice === 'other' ? f.previous_class : null,
        last_promoted_class: f.previous_school_choice === 'other' ? f.last_promoted_class : null,
        class_admitted: f.class_admitted || f.class_applied,
      };
      const res = await fetch('/api/admin/admissions/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', admission }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to submit.');
      const admRec = data.admission || admission;
      onCreated();
      onClose();
      // PDF — async, non-blocking, same as old app (toast then generate)
      try { await generateAdmissionPDF(admRec); } catch (e) { console.warn('PDF generation failed:', e); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="📝 New Admission (Internal)">
      <div className="flex flex-col gap-4 max-w-[640px]">
        {/* Progress bar */}
        <div className="flex gap-1">
          {STEPS.map((s, i) => (
            <div key={s} title={s} className="flex-1 h-1 rounded-full" style={{ background: i <= step ? '#5D4037' : '#E8DDD0' }} />
          ))}
        </div>
        <div className="text-xs font-bold text-brand-brown-light uppercase tracking-wide">{STEPS[step]}</div>

        {/* ── Step 0: Basic ── */}
        {step === 0 && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Input id="na-name" label="Full Name *" value={f.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="Surname Firstname Othername" />
              <div>
                <label className={lbl}>Class Applying For *</label>
                <select value={f.class_id} onChange={(e) => {
                  const c = classOpts.find((c) => c.id === e.target.value);
                  set('class_id', e.target.value);
                  set('class_applied', c?.name || '');
                }} className={field}>
                  <option value="">Select Class</option>
                  {classOpts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            {f.class_applied && fee > 0 && (
              <div className="rounded-lg p-3.5 text-white" style={{ background: 'linear-gradient(135deg,#5D4037,#8D6E63)' }}>
                <div className="text-[11px] font-semibold uppercase tracking-wide opacity-85">Admission Fee</div>
                <div className="text-xl font-bold">₦{fee.toLocaleString()}</div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Input id="na-aptcode" label="CBT / Aptitude Code" value={f.aptitude_code} onChange={(e) => set('aptitude_code', e.target.value)} placeholder="Code (if test taken)" />
              <Input id="na-aptscore" label="Aptitude Score" type="number" min={0} max={100} value={f.aptitude_score} onChange={(e) => set('aptitude_score', e.target.value)} placeholder="Auto-filled or manual" />
            </div>
          </div>
        )}

        {/* ── Step 1: Biodata — cascading country/state/LGA picker ── */}
        {step === 1 && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Gender *</label>
                <select value={f.gender} onChange={(e) => set('gender', e.target.value)} className={field}><option>Male</option><option>Female</option></select>
              </div>
              <Input id="na-dob" label="Date of Birth *" type="date" value={f.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Permanent Address</label>
              <textarea value={f.permanent_address} onChange={(e) => set('permanent_address', e.target.value)} rows={2} className={field} placeholder="Full address" />
            </div>
            {/* Nationality (country) */}
            <div>
              <label className={lbl}>Nationality *</label>
              {countries.length > 0 ? (
                <select value={f.nationality} onChange={(e) => onCountryChange(e.target.value)} className={field}>
                  <option value="">Select Nationality / Country</option>
                  {countries.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : (
                <Input id="na-nat" label="" value={f.nationality} onChange={(e) => set('nationality', e.target.value)} placeholder="Loading countries…" />
              )}
            </div>
            {/* State — shown after country is selected */}
            {f.nationality && (
              <div>
                <label className={lbl}>State / Province</label>
                {statesLoading ? (
                  <div className="text-xs text-brand-brown-light py-2">⏳ Loading states…</div>
                ) : states.length > 0 ? (
                  <select value={f.state_of_origin} onChange={(e) => onStateChange(e.target.value)} className={field}>
                    <option value="">Select State / Province</option>
                    {states.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <Input id="na-state" label="" value={f.state_of_origin} onChange={(e) => set('state_of_origin', e.target.value)} placeholder="State / Province" />
                )}
              </div>
            )}
            {/* LGA — shown after state is selected */}
            {f.state_of_origin && (
              <div>
                <label className={lbl}>LGA / District</label>
                {lgasLoading ? (
                  <div className="text-xs text-brand-brown-light py-2">⏳ Loading LGAs…</div>
                ) : lgas.length > 0 ? (
                  <select value={f.lga} onChange={(e) => set('lga', e.target.value)} className={field}>
                    <option value="">{f.nationality === 'Nigeria' ? 'Select LGA' : 'Select City / District'}</option>
                    {lgas.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                ) : (
                  <Input id="na-lga" label="" value={f.lga} onChange={(e) => set('lga', e.target.value)} placeholder="LGA / District" />
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Religion ── */}
        {step === 2 && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Religion</label>
                <select value={f.religion} onChange={(e) => set('religion', e.target.value)} className={field}>
                  <option value="">Select</option><option>Christianity</option><option>Islam</option><option>Traditional</option><option>Other</option>
                </select>
              </div>
              <Input id="na-denom" label="Denomination / Sect" value={f.denomination} onChange={(e) => set('denomination', e.target.value)} placeholder="e.g. Catholic, Baptist, Sunni" />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={f.same_addr} onChange={(e) => set('same_addr', e.target.checked)} />
              Residential address is same as permanent address
            </label>
            {!f.same_addr && (
              <div>
                <label className={lbl}>Residential Address</label>
                <textarea value={f.residential_address} onChange={(e) => set('residential_address', e.target.value)} rows={2} className={field} placeholder="Current residential address" />
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Previous School ── */}
        {step === 3 && (
          <div className="flex flex-col gap-3">
            <div>
              <label className={lbl}>Previous School</label>
              <select value={f.previous_school_choice} onChange={(e) => set('previous_school_choice', e.target.value)} className={field}>
                <option value="">Select</option><option value="nil">Nil (No previous school)</option><option value="other">Other School</option>
              </select>
            </div>
            {f.previous_school_choice === 'other' && (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input id="na-prevcls" label="Previous Class" value={f.previous_class} onChange={(e) => set('previous_class', e.target.value)} placeholder="e.g. Primary 5" />
                  <Input id="na-lastpromo" label="Last Promoted Class" value={f.last_promoted_class} onChange={(e) => set('last_promoted_class', e.target.value)} placeholder="e.g. Primary 6" />
                </div>
                <Input id="na-prevschool" label="Previous School Name" value={f.previous_school} onChange={(e) => set('previous_school', e.target.value)} placeholder="School name" />
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Parents ── */}
        {step === 4 && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Input id="na-par" label="Full Name *" value={f.parent_name} onChange={(e) => set('parent_name', e.target.value)} placeholder="Parent/Guardian name" />
              <div>
                <label className={lbl}>Relationship</label>
                <select value={f.parent_relationship} onChange={(e) => set('parent_relationship', e.target.value)} className={field}>
                  <option>Father</option><option>Mother</option><option>Guardian</option><option>Relative</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input id="na-phn" label="Phone Number *" type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="08xxxxxxxxxx" />
              <Input id="na-eml" label="Email *" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="parent@email.com" />
            </div>
            <div>
              <label className={lbl}>Parent Address</label>
              <textarea value={f.parent_address} onChange={(e) => set('parent_address', e.target.value)} rows={2} className={field} placeholder="Parent address" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>Parents Married?</label><select value={f.parents_married} onChange={(e) => set('parents_married', e.target.value)} className={field}><option value="yes">Yes</option><option value="no">No</option></select></div>
              <div><label className={lbl}>Parents Living Together?</label><select value={f.parents_together} onChange={(e) => set('parents_together', e.target.value)} className={field}><option value="yes">Yes</option><option value="no">No</option></select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>Who Takes Responsibility?</label><select value={f.responsibility} onChange={(e) => set('responsibility', e.target.value)} className={field}><option>Parent</option><option>Guardian</option><option>Relative</option></select></div>
              <div><label className={lbl}>Child Lives With?</label><select value={f.lives_with} onChange={(e) => set('lives_with', e.target.value)} className={field}><option>Family</option><option>Mother</option><option>Father</option><option>Relative</option><option>Guardian</option></select></div>
            </div>
            <div className="font-bold text-xs text-brand-brown-dark mt-1">Emergency Contact</div>
            <div className="grid grid-cols-2 gap-3">
              <Input id="na-emername" label="Emergency Contact Name" value={f.emergency_name} onChange={(e) => set('emergency_name', e.target.value)} placeholder="Full name" />
              <Input id="na-emerrel" label="Relationship" value={f.emergency_relationship} onChange={(e) => set('emergency_relationship', e.target.value)} placeholder="e.g. Uncle" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input id="na-emerphone" label="Emergency Phone" type="tel" value={f.emergency_phone} onChange={(e) => set('emergency_phone', e.target.value)} placeholder="08xxxxxxxxxx" />
              <Input id="na-emeraddr" label="Emergency Address" value={f.emergency_address} onChange={(e) => set('emergency_address', e.target.value)} placeholder="Address" />
            </div>
          </div>
        )}

        {/* ── Step 5: Health ── */}
        {step === 5 && (
          <div className="flex flex-col gap-3">
            <div>
              <label className={lbl}>Any health issues?</label>
              <select value={f.health_issues_flag} onChange={(e) => set('health_issues_flag', e.target.value)} className={field}><option value="no">No</option><option value="yes">Yes</option></select>
            </div>
            {f.health_issues_flag === 'yes' && (
              <div><label className={lbl}>Describe health issue</label><textarea value={f.health_issues} onChange={(e) => set('health_issues', e.target.value)} rows={2} className={field} /></div>
            )}
            <div>
              <label className={lbl}>Any disability?</label>
              <select value={f.disability_flag} onChange={(e) => set('disability_flag', e.target.value)} className={field}><option value="no">No</option><option value="yes">Yes</option></select>
            </div>
            {f.disability_flag === 'yes' && (
              <Input id="na-disability" label="Specify disability" value={f.disability} onChange={(e) => set('disability', e.target.value)} placeholder="Specify…" />
            )}
            {fee > 0 && (
              <div className="rounded-lg p-3.5 bg-brand-cream border-l-4" style={{ borderColor: '#5D4037' }}>
                <div className="font-bold text-xs text-brand-brown-dark mb-1">💰 Admission Fee Summary</div>
                <div className="text-sm">Total Admission Fee: <strong className="text-base">₦{fee.toLocaleString()}</strong></div>
              </div>
            )}
            <div className="rounded-lg p-3.5 bg-brand-cream flex flex-col gap-2">
              <div className="font-bold text-brand-brown-dark text-sm">Consent</div>
              <label className="flex items-start gap-2 text-[13px] cursor-pointer">
                <input type="checkbox" checked={f.consent_discipline} onChange={(e) => set('consent_discipline', e.target.checked)} className="mt-0.5" />
                I accept the school's discipline rules and code of conduct and understand that disciplinary measures may be applied as per school policy
              </label>
              <label className="flex items-start gap-2 text-[13px] cursor-pointer">
                <input type="checkbox" checked={f.consent_medical} onChange={(e) => set('consent_medical', e.target.checked)} className="mt-0.5" />
                I approve emergency medical treatment if required, including hospitalisation, and consent to the school taking my ward to hospital in an emergency
              </label>
            </div>
          </div>
        )}

        {/* ── Step 6: Academic ── */}
        {step === 6 && (
          <div className="flex flex-col gap-3">
            <div>
              <label className={lbl}>Class Admitted Into <span className="font-normal text-brand-brown-light">(will be auto-assigned on approval if left blank)</span></label>
              <select value={f.class_admitted} onChange={(e) => set('class_admitted', e.target.value)} className={field}>
                <option value="">Same as applied (auto-assign subclass)</option>
                {classOpts.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* ── Step 7: Payment ── */}
        {step === 7 && (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg p-3.5 text-white" style={{ background: 'linear-gradient(135deg,#5D4037,#8D6E63)' }}>
              <div className="text-[11px] font-semibold uppercase tracking-wide opacity-85">Total Admission Fee</div>
              <div className="text-2xl font-bold">₦{fee.toLocaleString()}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input id="na-amount" label="Amount Paid (₦)" type="number" min={0} value={f.amount_paid} onChange={(e) => set('amount_paid', e.target.value)} />
              <div>
                <label className={lbl}>Payment Method</label>
                <select value={f.payment_method} onChange={(e) => set('payment_method', e.target.value)} className={field}>
                  <option value="">Select</option><option>Cash</option><option>Transfer</option><option>Online</option><option>Cheque</option>
                </select>
              </div>
            </div>
            {balance > 0 && (
              <div className="rounded-lg p-3.5 bg-amber-50 border-l-4 border-amber-600">
                <div className="text-xs font-semibold text-amber-800">Balance Remaining</div>
                <div className="text-xl font-bold text-amber-700">₦{balance.toLocaleString()}</div>
              </div>
            )}
            <Input id="na-baldate" label="Balance Payment Due Date (optional)" type="date" value={f.balance_due_date} onChange={(e) => set('balance_due_date', e.target.value)} />
          </div>
        )}

        {error && <p className="text-sm text-danger-700">{error}</p>}

        <div className="flex justify-between pt-2">
          {step > 0 ? <Button variant="secondary" onClick={back}>← Back</Button> : <span />}
          {step < STEPS.length - 1 ? (
            <Button variant="primary" onClick={next}>Next →</Button>
          ) : (
            <Button variant="primary" onClick={submit} disabled={saving}>
              {saving ? 'Submitting…' : '✓ Submit & Generate PDF'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
