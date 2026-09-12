import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';

// Real school_settings shape this module needs — a subset of what
// School Settings already reads/writes, plus school_director_stamp
// which the old app references directly on SCHOOL_SETTINGS. Not
// confirmed as a live column the way finance_signatory_stamp is (that
// one was verified when School Settings was built), so it's optional
// here with finance_signatory_stamp as the fallback actually confirmed
// to exist — same "School Director" role the Settings screen already
// offers for that signatory slot.
export interface IdCardSchoolSettings {
  school_name?: string;
  motto?: string;
  primary_color?: string;
  logo_url?: string;
  address?: string;
  phone1?: string;
  email?: string;
  current_session?: string;
  school_director_stamp?: string;
  finance_signatory_stamp?: string;
}

export interface IdCardPerson {
  id: string;
  full_name?: string;
  // student fields
  admission_number?: string;
  class_name?: string;
  gender?: string;
  session?: string;
  photo_url?: string;
  parent_name?: string;
  guardian_name?: string;
  next_of_kin?: string;
  parent_phone?: string;
  guardian_phone?: string;
  next_of_kin_phone?: string;
  // staff fields
  role?: string;
  avatar_url?: string;
  employee_id?: string;
  staff_id?: string;
  emergency_contact?: string;
  emergency_phone?: string;
}

export type IdCardType = 'students' | 'staff';

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Same first-name-first display students use elsewhere in this repo —
// the old app's fmtStuName(). Students are stored Surname-first
// (full_name = "Surname First Other"); this just doesn't reorder here
// since the ID card, like the old app's card, shows full_name as-is.
function fmtStuName(name?: string): string {
  return name || '—';
}

export function idcDarken(hex: string, amount: number): string {
  try {
    const c = hex.replace('#', '');
    let r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    r = Math.max(0, r - Math.round(255 * amount));
    g = Math.max(0, g - Math.round(255 * amount));
    b = Math.max(0, b - Math.round(255 * amount));
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  } catch {
    return hex;
  }
}
export function idcLighten(hex: string, amount: number): string {
  try {
    const c = hex.replace('#', '');
    let r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    r = Math.min(255, r + Math.round(255 * amount));
    g = Math.min(255, g + Math.round(255 * amount));
    b = Math.min(255, b + Math.round(255 * amount));
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  } catch {
    return '#C5A585';
  }
}

// Ported from _idcGenCodes() (index.html ~L30820). Old app loaded
// QRCode.js/JsBarcode from cdnjs at runtime — same failure mode as
// IdCardGenerator.tsx's earlier bug — so this uses the real `qrcode` /
// `jsbarcode` npm imports instead, same fix applied there.
export async function idcGenCodes(qrText: string, barcodeText: string): Promise<{ qrUrl: string; barcodeUrl: string }> {
  let qrUrl = '';
  try {
    qrUrl = await QRCode.toDataURL(qrText || 'VIS-ID', { width: 80, margin: 1, errorCorrectionLevel: 'L' });
  } catch (e) {
    console.warn('[IDCard] QR generation failed:', e);
  }

  let barcodeUrl = '';
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, String(barcodeText || 'VIS000').slice(0, 30), {
      format: 'CODE128', width: 1.3, height: 26, displayValue: false, margin: 2,
      background: '#ffffff', lineColor: '#1a1a1a',
    });
    barcodeUrl = canvas.toDataURL();
  } catch (e) {
    console.warn('[IDCard] JsBarcode generation failed:', e);
  }

  return { qrUrl, barcodeUrl };
}

// Ported from _idcBuildFront() (index.html ~L30861-30909).
export function idcBuildFront(person: IdCardPerson, type: IdCardType, idx: string, ss: IdCardSchoolSettings): string {
  const pc = ss.primary_color || '#5D4037';
  const dc = idcDarken(pc, 0.18);
  const isStudent = type === 'students';

  const name = isStudent ? fmtStuName(person.full_name) : (person.full_name || '—');
  const photoUrl = person.photo_url || person.avatar_url || null;
  const session = isStudent ? (person.session || ss.current_session || '') : (ss.current_session || '');
  const idNum = isStudent
    ? (person.admission_number || '—')
    : (person.employee_id || person.staff_id || (person.id || '').toString().slice(0, 8).toUpperCase() || '—');
  const classOrRole = isStudent
    ? (person.class_name || '')
    : (person.role || 'staff').replace(/_/g, ' ').replace(/\bproprietor\b/gi, 'School Director').replace(/\b\w/g, (c) => c.toUpperCase());
  const gender = isStudent ? (person.gender || '') : '';
  const cardLabel = isStudent ? 'STUDENT IDENTITY CARD' : 'STAFF IDENTITY CARD';

  return `<div class="pvc-card pvc-front" id="pvc-front-${esc(idx)}" style="background:#fff;">
    <div class="pvc-front-header" style="background:linear-gradient(135deg,${pc} 0%,${dc} 100%);">
      ${ss.logo_url
        ? `<img src="${esc(ss.logo_url)}" class="pvc-school-logo" alt="Logo" crossorigin="anonymous">`
        : `<div class="pvc-school-logo-placeholder">🏫</div>`}
      <div class="pvc-school-info">
        <div class="pvc-school-name">${esc(ss.school_name || 'School Name')}</div>
        <div class="pvc-school-motto">${esc(ss.motto || '')}</div>
        <div class="pvc-card-type">${cardLabel}</div>
      </div>
    </div>
    <div class="pvc-body">
      <div class="pvc-photo-wrap">
        ${photoUrl
          ? `<img src="${esc(photoUrl)}" class="pvc-photo" style="border-color:${pc};" alt="Photo" crossorigin="anonymous">`
          : `<div class="pvc-photo-placeholder"><span>PHOTO</span></div>`}
      </div>
      <div class="pvc-info">
        <div class="pvc-name">${esc(name)}</div>
        <div style="height:3px;width:28px;border-radius:2px;background:${pc};margin:3px 0;opacity:.65;"></div>
        <div class="pvc-field">
          <div class="pvc-field-label">${isStudent ? 'Admission No.' : 'Staff ID'}</div>
          <div class="pvc-field-val" style="font-family:monospace;color:${pc};font-weight:800;font-size:8px;">${esc(idNum)}</div>
        </div>
        <div class="pvc-field">
          <div class="pvc-field-label">${isStudent ? 'Class' : 'Role'}</div>
          <div class="pvc-field-val">${esc(classOrRole)}</div>
        </div>
        ${gender ? `<div class="pvc-field"><div class="pvc-field-label">Gender</div><div class="pvc-field-val">${esc(gender)}</div></div>` : ''}
        ${session ? `<div class="pvc-field"><div class="pvc-field-label">Session</div><div class="pvc-field-val" style="font-weight:800;">${esc(session)}</div></div>` : ''}
      </div>
    </div>
    <div class="pvc-bottom-strip" style="background:linear-gradient(90deg,${pc},${dc});">
      <span class="pvc-session-badge">${isStudent ? esc(session) + ' SESSION' : esc((ss.school_name || '').substring(0, 35))}</span>
    </div>
  </div>`;
}

// Ported from _idcBuildBack() (index.html ~L30913-30963).
export function idcBuildBack(
  person: IdCardPerson, type: IdCardType, idx: string, qrUrl: string, barcodeUrl: string, ss: IdCardSchoolSettings
): string {
  const pc = ss.primary_color || '#5D4037';
  const dc = idcDarken(pc, 0.18);
  const isStudent = type === 'students';
  const schoolName = ss.school_name || 'School Name';
  const stamp = ss.school_director_stamp || ss.finance_signatory_stamp || '';

  const emgContact = isStudent
    ? (person.parent_name || person.guardian_name || person.next_of_kin || '')
    : (person.emergency_contact || '');
  const emgTel = isStudent
    ? (person.parent_phone || person.guardian_phone || person.next_of_kin_phone || '')
    : (person.emergency_phone || '');

  const qrBlock = qrUrl
    ? `<img src="${qrUrl}" alt="QR" style="width:36px;height:36px;flex-shrink:0;border:1px solid #eee;border-radius:3px;image-rendering:pixelated;align-self:center;">`
    : '';
  const barcodeStrip = barcodeUrl
    ? `<div style="height:20px;background:#fff;border-top:0.5px solid #e0d8d4;display:flex;align-items:center;justify-content:center;padding:1px 10px;flex-shrink:0;overflow:hidden;"><img src="${barcodeUrl}" alt="Barcode" style="height:16px;max-width:100%;display:block;object-fit:contain;"></div>`
    : '';

  return `<div class="pvc-card pvc-back" id="pvc-back-${esc(idx)}" style="background:#fff;">
    <div class="pvc-back-header" style="background:linear-gradient(135deg,${pc} 0%,${dc} 100%);height:10px;padding:0;"></div>
    <div class="pvc-back-body">
      <div style="display:flex;align-items:flex-start;gap:4px;margin-bottom:6px;">
        <div class="pvc-property-banner" style="border-left-color:${pc};flex:1;margin-bottom:0;">
          <div class="pvc-property-text" style="color:${pc};">THIS IS THE PROPERTY OF ${esc(schoolName.toUpperCase())}</div>
          <div style="font-size:5.5px;color:#8D6E63;margin-top:2px;font-style:italic;">If found, kindly return to the school.</div>
        </div>
        ${qrBlock}
      </div>
      <div class="pvc-back-fields">
        <div class="pvc-back-field" style="grid-column:1/-1;">
          <div class="pvc-back-field-label">Address</div>
          <div class="pvc-back-field-line" style="font-size:5.5px;">${esc(ss.address || '')}</div>
        </div>
        <div class="pvc-back-field">
          <div class="pvc-back-field-label">Phone</div>
          <div class="pvc-back-field-line">${esc(ss.phone1 || '')}</div>
        </div>
        <div class="pvc-back-field">
          <div class="pvc-back-field-label">Email</div>
          <div class="pvc-back-field-line" style="font-size:5.5px;word-break:break-all;">${esc(ss.email || '')}</div>
        </div>
        <div class="pvc-back-field">
          <div class="pvc-back-field-label">Emergency Contact</div>
          <div class="pvc-back-field-line">${esc(emgContact)}</div>
        </div>
        <div class="pvc-back-field">
          <div class="pvc-back-field-label">Tel</div>
          <div class="pvc-back-field-line">${esc(emgTel)}</div>
        </div>
      </div>
      <div class="pvc-sig-area">
        <div>
          <div class="pvc-sig-line"></div>
          <div class="pvc-sig-label">School Director Signature</div>
        </div>
        <div class="pvc-stamp-box">
          ${stamp ? `<img src="${esc(stamp)}" style="width:36px;height:36px;border-radius:50%;object-fit:contain;" crossorigin="anonymous">` : 'STAMP'}
        </div>
      </div>
    </div>
    ${barcodeStrip}
  </div>`;
}

// Same QR payload convention as _idcPrintSingle()/_idcGenerateBulkPDF()
// — a verification URL, not just a bare ID, so scanning opens the
// record directly.
export function idcIdNumber(person: IdCardPerson, type: IdCardType): string {
  return type === 'students'
    ? (person.admission_number || String(person.id || '').slice(0, 14) || 'VIS')
    : (person.employee_id || person.staff_id || String(person.id || '').slice(0, 14) || 'VIS');
}
export function idcQrText(idNum: string, type: IdCardType): string {
  const base = window.location.origin + window.location.pathname;
  return `${base}?verify=1&id=${encodeURIComponent(idNum)}&type=${type === 'students' ? 'student' : 'staff'}`;
}

// Same CSS as the old app's <style> block (index.html ~L30559-30632),
// verbatim — injected once by the component that uses these builders.
export const IDC_STYLES = `
.idc-class-card{background:#fff;border-radius:16px;padding:18px 20px;cursor:pointer;border:2px solid transparent;transition:all .2s;box-shadow:0 2px 10px rgba(93,64,55,.08);display:flex;align-items:center;gap:14px;}
.idc-class-card:hover{border-color:#5D4037;transform:translateY(-2px);box-shadow:0 8px 24px rgba(93,64,55,.13);}
.idc-class-card.selected{border-color:#5D4037;background:#FDF6EE;}
.idc-stu-row{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-radius:11px;transition:background .15s;border-bottom:1px solid #F5EDE3;}
.idc-stu-row:hover{background:#FDFAF5;}
.idc-stu-avatar{width:38px;height:38px;border-radius:10px;object-fit:cover;background:#F5EDE3;flex-shrink:0;border:2px solid #E8DDD0;}
.pvc-card{width:323px;height:204px;border-radius:12px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.22);font-family:Arial,sans-serif;position:relative;flex-shrink:0;display:flex;flex-direction:column;}
.pvc-front{background:#fff;}
.pvc-front-header{padding:10px 12px 9px;display:flex;align-items:center;justify-content:center;gap:9px;flex-shrink:0;text-align:center;}
.pvc-school-logo{width:36px;height:36px;border-radius:8px;object-fit:contain;background:rgba(255,255,255,.15);flex-shrink:0;border:1.5px solid rgba(255,255,255,.35);}
.pvc-school-logo-placeholder{width:36px;height:36px;border-radius:8px;background:rgba(255,255,255,.18);border:1.5px solid rgba(255,255,255,.35);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.7);font-size:16px;flex-shrink:0;}
.pvc-school-info{flex:1;min-width:0;text-align:center;}
.pvc-school-name{font-size:11px;font-weight:800;color:#fff;letter-spacing:.04em;line-height:1.2;font-family:Georgia,serif;}
.pvc-school-motto{font-size:8px;color:rgba(255,255,255,.78);font-style:italic;margin-top:2px;line-height:1.2;}
.pvc-card-type{font-size:6px;font-weight:800;letter-spacing:.12em;color:rgba(255,255,255,.9);background:rgba(255,255,255,.15);border-radius:20px;padding:2px 7px;margin-top:3px;display:inline-block;text-transform:uppercase;}
.pvc-body{display:flex;flex:1;padding:10px 12px;gap:10px;min-height:0;overflow:hidden;justify-content:center;align-items:center;}
.pvc-photo-wrap{flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:4px;}
.pvc-photo{width:56px;height:68px;border-radius:8px;object-fit:cover;border:2px solid;flex-shrink:0;}
.pvc-photo-placeholder{width:56px;height:68px;border-radius:8px;border:2px dashed #C5A585;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#C5A585;font-size:18px;gap:3px;background:#fafafa;}
.pvc-photo-placeholder span{font-size:6px;color:#C5A585;font-weight:600;letter-spacing:.04em;}
.pvc-info{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:3px;text-align:center;}
.pvc-name{font-size:9.5px;font-weight:800;color:#1a0a05;line-height:1.2;word-break:break-word;text-align:center;}
.pvc-field{display:flex;flex-direction:column;gap:1px;align-items:center;text-align:center;}
.pvc-field-label{font-size:5.5px;font-weight:800;letter-spacing:.1em;color:#8D6E63;text-transform:uppercase;}
.pvc-field-val{font-size:7.5px;font-weight:600;color:#2C1810;line-height:1.2;}
.pvc-bottom-strip{height:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.pvc-session-badge{font-size:6px;font-weight:800;letter-spacing:.1em;color:#fff;text-transform:uppercase;}
.pvc-back{background:#fff;}
.pvc-back-body{flex:1;padding:9px 12px;display:flex;flex-direction:column;justify-content:space-between;min-height:0;overflow:hidden;}
.pvc-property-banner{background:linear-gradient(90deg,rgba(93,64,55,.08),rgba(93,64,55,.04));border-left:3px solid #5D4037;padding:4px 8px;border-radius:0 6px 6px 0;margin-bottom:6px;}
.pvc-property-text{font-size:6px;font-weight:800;color:#5D4037;letter-spacing:.06em;text-transform:uppercase;}
.pvc-back-fields{display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;flex:1;}
.pvc-back-field{display:flex;flex-direction:column;gap:1px;}
.pvc-back-field-label{font-size:5px;font-weight:800;letter-spacing:.1em;color:#8D6E63;text-transform:uppercase;}
.pvc-back-field-line{font-size:6.5px;color:#2C1810;border-bottom:0.5px solid #DDD;padding-bottom:2px;min-height:12px;}
.pvc-sig-area{display:flex;align-items:flex-end;justify-content:space-between;margin-top:5px;padding-top:5px;border-top:0.5px solid #EEE;}
.pvc-sig-label{font-size:5.5px;color:#8D6E63;font-weight:700;text-transform:uppercase;letter-spacing:.06em;}
.pvc-sig-line{width:70px;height:0.5px;background:#BBB;margin-bottom:1px;}
.pvc-stamp-box{width:38px;height:38px;border-radius:50%;border:1.5px dashed #CCC;display:flex;align-items:center;justify-content:center;font-size:5.5px;color:#CCC;font-weight:700;text-transform:uppercase;letter-spacing:.05em;text-align:center;line-height:1.3;}
.idc-list{display:flex;flex-direction:column;gap:0;}
`;
