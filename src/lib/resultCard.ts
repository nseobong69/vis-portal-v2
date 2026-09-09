// ═══════════════════════════════════════════════════════════════════════════
// RESULT CARD — ported 1:1 from the old app's buildResultSheet() and its
// neighbouring helpers (index.html, single-file build, "Combined PDF" /
// "My Results" features — Feature Checklist rows 14 & 40).
//
// This file is pure/isomorphic on purpose: it takes plain data in and
// returns an HTML string out. The old app used this same string both for
// live on-screen rendering (with Print/Download buttons appended) and for
// html2canvas rasterisation into the combined class PDF — so it MUST NOT
// gain a DOM or Supabase dependency, or the two call sites (single-result
// download, combined-class loop) drift out of pixel-parity with each other.
//
// Anything visual (colors, spacing, fonts, layout) is copied verbatim from
// the old template — this is a report card students/parents already know
// the look of, so pixel changes weren't in scope for this port.
// ═══════════════════════════════════════════════════════════════════════════

/** Mirrors escapeHTML(str) — used everywhere a DB string lands in innerHTML. */
export function escapeHTML(str: unknown): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Mirrors fmtStuName(full) — "First Last" → "First, Last" for the info band. */
export function fmtStuName(full: string | null | undefined): string {
  const f = (full || '').trim();
  if (!f || f === '—') return f || '—';
  const sp = f.indexOf(' ');
  if (sp < 0) return f;
  return f.slice(0, sp) + ', ' + f.slice(sp + 1);
}

// ── Pupil / Student label helper — identical rules to the old app ──────────
export function isPupilClass(classNameOrLevel: string | null | undefined): boolean {
  if (!classNameOrLevel) return false;
  const s = classNameOrLevel.toLowerCase();
  if (s === 'kindergarten' || s === 'nursery' || s === 'primary') return true;
  return /kindergarten|nursery|primary|kinder|nurs|prim/i.test(s);
}
export function pupilOrStudent(classNameOrLevel: string | null | undefined, plural = false): string {
  return isPupilClass(classNameOrLevel) ? (plural ? 'Pupils' : 'Pupil') : (plural ? 'Students' : 'Student');
}

// ── Grade scale — identical bands/colors to the old app's const GS ─────────
export interface GradeBand { min: number; max: number; g: string; r: string; c: string }
export const GS: GradeBand[] = [
  { min: 80, max: 100, g: 'A', r: 'Excellent', c: '#1D4ED8' },
  { min: 70, max: 79, g: 'B+', r: 'Very Good', c: '#047857' },
  { min: 60, max: 69, g: 'B', r: 'Good', c: '#15803D' },
  { min: 50, max: 59, g: 'C', r: 'Pass', c: '#15803D' },
  { min: 45, max: 49, g: 'D', r: 'Fair', c: '#B45309' },
  { min: 40, max: 44, g: 'E', r: 'Poor', c: '#C2410C' },
  { min: 0, max: 39, g: 'F', r: 'Fail', c: '#B91C1C' },
];
export function grade(total: number | string | null | undefined): GradeBand {
  const v = typeof total === 'string' ? parseFloat(total) : total;
  if (v == null || isNaN(v as number)) return { min: 0, max: 0, g: '—', r: '—', c: '#999' };
  return GS.find((x) => (v as number) >= x.min && (v as number) <= x.max) ?? GS[GS.length - 1];
}
// PASS_MARK in the old app is a school-settings-driven function; the report
// card's own Pass/Fail Rule legend (hardcoded in the template, see below)
// has always read "0–43% → FAIL / 44–100% → PASS", so 44 is the effective
// constant actually driving pf/pfColor in this feature specifically.
const PASS_MARK = 44;
export function passFail(avg: number | string): 'PASS' | 'FAIL' {
  return parseFloat(String(avg)) >= PASS_MARK ? 'PASS' : 'FAIL';
}
export function passFailColor(avg: number | string): string {
  return parseFloat(String(avg)) >= PASS_MARK ? '#15803D' : '#B91C1C';
}

// ── Affective trait scale — identical labels/letters/colors ────────────────
export const TRAIT_LABELS: Record<number, string> = { 5: 'Excellent', 4: 'Very Good', 3: 'Good', 2: 'Poor', 1: 'Very Poor' };
export const TRAIT_GRADE_LETTERS: Record<number, string> = { 5: 'A', 4: 'B', 3: 'C', 2: 'D', 1: 'E' };
export const TRAIT_GRADE_COLORS: Record<number, string> = { 5: '#1D4ED8', 4: '#047857', 3: '#15803D', 2: '#B45309', 1: '#B91C1C' };

export interface Trait { trait: string; rating: number }

/** Mirrors genAffectiveTraits(avg) — fallback random trait ratings when a
 *  student has no saved affective_traits row yet, biased toward their
 *  average score band. */
export function genAffectiveTraits(avg: number | string): Trait[] {
  const a = parseFloat(String(avg)) || 0;
  const bias = a >= 70 ? [4, 5] : a >= 50 ? [3, 4, 5] : a >= 35 ? [2, 3, 4] : [1, 2, 3];
  const pick = () => bias[Math.floor(Math.random() * bias.length)];
  const traits = ['Punctuality', 'Mental Alertness', 'Behaviour', 'Reliability', 'Respect', 'Neatness', 'Politeness', 'Honesty', 'Relationship with Others'];
  return traits.map((t) => ({ trait: t, rating: pick() }));
}

/** Mirrors teacherComment(avg). */
export function teacherComment(avg: number): string {
  if (avg <= 35) return 'Poor performance, sit up in the next term.';
  if (avg <= 40) return 'Below average, study hard next term.';
  if (avg <= 45) return 'You can do better next term.';
  if (avg <= 50) return 'Put more effort in the next term.';
  if (avg <= 55) return 'You have shown some improvement, keep pushing.';
  if (avg <= 60) return 'Fair performance, strive for better results.';
  if (avg <= 65) return 'Good effort, you can achieve more.';
  if (avg <= 70) return 'Good performance, keep it up.';
  if (avg <= 75) return 'Very good performance, aim even higher.';
  if (avg <= 80) return 'Excellent work, maintain the standard.';
  if (avg <= 85) return 'Outstanding performance, keep shining.';
  if (avg <= 90) return 'Excellent and impressive performance.';
  return 'Exceptional performance, top of the class.';
}

/** Mirrors principalComment(avg). */
export function principalComment(avg: number): string {
  const a = avg;
  if (a <= 35) return 'This performance is unsatisfactory. Immediate improvement is required next term.';
  if (a <= 40) return 'Performance is below expectation. Greater commitment is needed.';
  if (a <= 45) return 'There is room for improvement. More focus and discipline are required.';
  if (a <= 50) return 'Performance is marginal. Increased effort will yield better results.';
  if (a <= 55) return 'A fair attempt. With consistency, better outcomes can be achieved.';
  if (a <= 60) return 'Satisfactory performance. Strive for continuous improvement.';
  if (a <= 65) return 'A commendable effort. Aim higher for excellence.';
  if (a <= 70) return 'Good performance. Maintain and build on this standard.';
  if (a <= 75) return 'Very good performance. Continue to improve steadily.';
  if (a <= 80) return 'Excellent performance. Keep up the good work.';
  if (a <= 85) return 'Outstanding performance. You are on the path to excellence.';
  if (a <= 90) return 'Highly impressive performance. Continue to excel.';
  return 'Exceptional achievement. A model of academic excellence.';
}

export interface ResultRow {
  subject_name: string;
  ca_score: number | null;
  exam_score: number | null;
  total: number | null;
  is_absent?: boolean | null;
  grade?: string | null;
}

/** Mirrors calcTotals(results). */
export function calcTotals(results: ResultRow[]) {
  const arr = results || [];
  const grand = arr.reduce((a, r) => a + (parseFloat(String(r.total)) || 0), 0);
  const totalObtainable = arr.length * 100;
  const avg = arr.length ? parseFloat((grand / arr.length).toFixed(1)) : 0;
  const pf = passFail(avg);
  const pfColor = passFailColor(avg);
  return { grand, totalObtainable, avg, pf, pfColor };
}

/** Mirrors _tieRank(sortedList, studentId) — tie-aware rank lookup for a
 *  list pre-sorted descending by grand total. Students with equal totals
 *  share a position and the next position skips (e.g. 1,1,3). */
export function tieRank(sortedList: { student_id: string; total: number }[], studentId: string): number | null {
  const idx = sortedList.findIndex((r) => r.student_id === studentId);
  if (idx < 0) return null;
  const myTotal = sortedList[idx].total;
  let firstSameIdx = idx;
  while (firstSameIdx > 0 && sortedList[firstSameIdx - 1].total === myTotal) firstSameIdx--;
  return firstSameIdx + 1;
}

/** Mirrors ordinal(n) — "1st" / "2nd" / "3rd" / "4th"… used for Position. */
export function ordinal(n: number | null | undefined): string {
  if (!n) return '—';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export interface ClassSigData {
  ctName?: string | null;
  ctTitle?: string | null;
  ctSig?: string | null;
  htName?: string | null;
  htTitle?: string | null;
  htSig?: string | null;
  htStamp?: string | null;
}

// Loosely typed on purpose, same as the old app's SCHOOL_SETTINGS global —
// it's a wide, evolving school_settings row. Tighten once Phase 3 (School
// Settings) lands a real interface for it.
export type SchoolSettings = Record<string, any>;

export interface StudentForCard {
  full_name?: string | null;
  admission_number?: string | null;
  class_name?: string | null;
  avatar_url?: string | null;
}

export interface BuildResultSheetArgs {
  results: ResultRow[];
  grand: number;
  totalObtainable: number;
  avg: number;
  pos: number | null;
  ordinal: (n: number | null | undefined) => string;
  tcComment: string;
  pcComment: string;
  genDate: string;
  pf: string;
  pfColor: string;
  SS: SchoolSettings;
  myLabel: string;
  classCount: number;
  traits: Trait[];
  term: string;
  sess: string;
  student: StudentForCard | null | undefined;
  qrPin: string;
  classSigData: ClassSigData | null | undefined;
  qrDataUrl: string;
  /** true when rendering off-DOM for html2canvas capture — suppresses the
   *  Print/Download buttons and the (editable) comment-box click handlers'
   *  visual affordance is irrelevant since forPDF markup never gets clicked. */
  forPDF?: boolean;
}

/**
 * Ported 1:1 from buildResultSheet() (index.html L9883-10202). Same markup,
 * inline styles, and dynamic-sizing rules (8–17+ subject rows scale font/
 * padding down to keep one A4 page) as the old app, so the combined PDF and
 * the single-result "My Results" download stay pixel-identical to what
 * students/parents/print copies already look like today.
 */
export function buildResultSheet(args: BuildResultSheetArgs): string {
  const {
    results, grand, totalObtainable, avg, pos, ordinal: ord,
    tcComment, pcComment, genDate, pf, pfColor,
    SS, myLabel, classCount, traits, term, sess, student, qrPin, classSigData, qrDataUrl, forPDF,
  } = args;

  // ── Resolve signature data ────────────────────────────────────────────
  const isKNP = isPupilClass(student?.class_name);
  const csd = classSigData || {};
  const ctName = csd.ctName || SS.class_teacher_name || '';
  const ctTitle = csd.ctTitle || SS.class_teacher_title || 'Class Teacher';
  const ctSig = csd.ctSig || null;
  const htName = csd.htName || (isKNP ? SS.head_teacher_name : SS.principal_name) || '';
  const htTitle = csd.htTitle || (isKNP ? (SS.head_teacher_title || 'Head Teacher') : (SS.principal_title || 'Principal'));
  const htSig = csd.htSig || (isKNP ? SS.head_teacher_signature : SS.principal_signature) || null;
  const htStamp = csd.htStamp || (isKNP ? SS.head_teacher_stamp : SS.principal_stamp) || SS.stamp_url || null;
  const studentsOrPupilsInClass = pupilOrStudent(student?.class_name, true) + ' in Class';

  // ── Dynamic sizing: scales from roomy (8 subjects) to compact (17+) ────
  const sc = results.length || 1;
  const fs = sc > 14 ? '14px' : sc > 12 ? '15px' : sc > 9 ? '16px' : '17px';
  const pd = sc > 14 ? '3.5px 5px' : sc > 12 ? '4px 6px' : sc > 9 ? '4.5px 7px' : '5.5px 8px';
  const hPd = '4px 10px';
  const iPd = '4px 10px';
  const aPd = sc > 12 ? '3px 10px' : '4px 10px';
  const tdPd = sc > 12 ? '3px 10px' : '4px 10px';
  const tf = '15px';
  const spPd = sc > 12 ? '3px 10px' : '4px 10px';

  // ── Subject rows ────────────────────────────────────────────────────────
  const subjectRows = results
    .map((r, idx) => {
      const isAb = !!(r.is_absent || r.grade === 'AB');
      const gd = isAb ? { g: 'AB', r: 'Absent', c: '#B91C1C' } : grade(r.total);
      const bg = idx % 2 === 0 ? '#fff' : '#FAF6EF';
      const cb = 'border-right:1.5px solid #4A2C1F;';
      return `<tr style="border-bottom:2px solid #4A2C1F;background:${bg};">
      <td style="padding:${pd};${cb}font-size:${fs};font-weight:700;color:#241209;">${escapeHTML(r.subject_name || '—')}</td>
      <td style="padding:${pd};${cb}text-align:center;font-size:${fs};font-weight:700;color:#4A2C1F;">${isAb ? '-' : r.ca_score ?? '—'}</td>
      <td style="padding:${pd};${cb}text-align:center;font-size:${fs};font-weight:700;color:#4A2C1F;">${isAb ? '-' : r.exam_score ?? '—'}</td>
      <td style="padding:${pd};${cb}text-align:center;font-size:${fs};font-weight:900;color:#241209;">${isAb ? 'AB' : r.total ?? '—'}</td>
      <td style="padding:${pd};${cb}text-align:center;"><span style="background:${gd.c}22;color:${gd.c};padding:1.5px 6px;border-radius:4px;font-size:${fs};font-weight:900;border:0.75px solid ${gd.c}66;">${gd.g}</span></td>
      <td style="padding:${pd};font-size:${fs};color:${gd.c};font-weight:800;">${gd.r}</td>
    </tr>`;
    })
    .join('');

  // ── Affective trait cells: 3 columns × 3 traits ────────────────────────
  const filteredTraits = (traits || []).filter((t) => t.trait !== 'Relationship with Staff');
  const traitCols = [filteredTraits.slice(0, 3), filteredTraits.slice(3, 6), filteredTraits.slice(6, 9)];
  const traitColHTML = traitCols
    .map(
      (col) => `
    <div style="flex:1;border:2px solid #4A2C1F;border-radius:4px;overflow:hidden;">
      ${col
        .map((t, i) => {
          const letter = TRAIT_GRADE_LETTERS[t.rating] || '—';
          const col_ = TRAIT_GRADE_COLORS[t.rating] || '#8D6E63';
          const bg = i % 2 === 0 ? '#fff' : '#FAF6EF';
          return `<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;padding:5px 8px;background:${bg};${i < col.length - 1 ? 'border-bottom:1.5px solid #4A2C1F;' : ''}">
          <span style="font-size:${tf};font-weight:700;color:#241209;">${escapeHTML(t.trait)}</span>
          <span style="display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 3px;background:${col_}22;color:${col_};font-weight:900;font-size:15px;border-radius:4px;border:1px solid ${col_}66;">${letter}</span>
        </div>`;
        })
        .join('')}
    </div>`
    )
    .join('');

  // ── Grade scale rows ────────────────────────────────────────────────────
  const gradeScale = GS.map(
    (g) => `
    <tr style="border-bottom:0.5px solid #DDD0BA;">
      <td style="padding:1.5px 4px;font-size:8.5px;color:#241209;font-weight:600;">${g.min}–${g.max}</td>
      <td style="padding:1.5px 3px;text-align:center;"><span style="background:${g.c}20;color:${g.c};padding:1px 5px;border-radius:3px;font-size:8.5px;font-weight:900;border:0.5px solid ${g.c}40;">${g.g}</span></td>
      <td style="padding:1.5px 4px;font-size:8.5px;color:${g.c};font-weight:800;">${g.r}</td>
    </tr>`
  ).join('');

  // ── Affective Trait Scale legend ────────────────────────────────────────
  const affectiveScale = [5, 4, 3, 2, 1]
    .map(
      (n) => `
    <tr style="border-bottom:0.5px solid #DDD0BA;">
      <td style="padding:1.5px 3px;text-align:center;"><span style="background:${TRAIT_GRADE_COLORS[n]}20;color:${TRAIT_GRADE_COLORS[n]};padding:1px 5px;border-radius:3px;font-size:8.5px;font-weight:900;border:0.5px solid ${TRAIT_GRADE_COLORS[n]}40;">${TRAIT_GRADE_LETTERS[n]}</span></td>
      <td style="padding:1.5px 4px;font-size:8.5px;color:${TRAIT_GRADE_COLORS[n]};font-weight:800;">${TRAIT_LABELS[n]}</td>
    </tr>`
    )
    .join('');

  // ── Logo ────────────────────────────────────────────────────────────────
  const logo = SS.logo_url
    ? `<img src="${SS.logo_url}" style="width:52px;height:52px;object-fit:contain;display:block;filter:drop-shadow(0 1px 4px rgba(93,64,55,.25));">`
    : `<div style="width:52px;height:52px;border-radius:50%;background:rgba(93,64,55,.08);border:2px solid rgba(93,64,55,.25);display:flex;align-items:center;justify-content:center;font-size:22px;">🏫</div>`;

  // ── Term end / next term dates ──────────────────────────────────────────
  const termEndStr = SS.term_end_date
    ? new Date(SS.term_end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
  const nextTermStr = SS.next_term_date
    ? new Date(SS.next_term_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  const tcCommentEsc = tcComment.replace(/'/g, "\\'");
  const pcCommentEsc = pcComment.replace(/'/g, "\\'");

  // ════════════════════════════════════════════════════════════════════════
  // TEMPLATE
  // ════════════════════════════════════════════════════════════════════════
  return `
<div id="result-card" style="background:#fff;width:100%;font-family:'DM Sans',Arial,sans-serif;border:1px solid #C8B89A;border-radius:2px;overflow:hidden;">

  <!-- ════ GOLD TOP ACCENT ════ -->
  <div style="height:3px;background:linear-gradient(90deg,#4A2C1F 0%,#C8960C 35%,#F0C040 50%,#C8960C 65%,#4A2C1F 100%);"></div>

  <!-- ════ PREMIUM HEADER ════ -->
  <div style="background:linear-gradient(135deg,#3A1B0E 0%,#4A2C1F 55%,#2C1810 100%);padding:${hPd};position:relative;overflow:hidden;border-bottom:3px solid #C8960C;">
    <div style="position:absolute;right:-35px;top:-35px;width:130px;height:130px;border-radius:50%;border:16px solid rgba(255,255,255,.08);pointer-events:none;"></div>
    <div style="position:absolute;left:-20px;bottom:-30px;width:90px;height:90px;border-radius:50%;border:10px solid rgba(255,255,255,.05);pointer-events:none;"></div>

    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;position:relative;">
      <div style="flex-shrink:0;padding:2px;">${logo}</div>

      <div style="flex:1;text-align:center;padding:0 6px;">
        <div style="font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-size:16px;font-weight:800;color:#FFFFFF;letter-spacing:.04em;line-height:1.2;">
          ${escapeHTML(SS.school_name || 'Victorious International Schools')}
        </div>
        <div style="display:flex;align-items:center;gap:5px;margin:3px 0;">
          <div style="flex:1;height:1px;background:linear-gradient(90deg,transparent,rgba(150,108,8,.6));"></div>
          <div style="width:6px;height:6px;background:#9C6F08;border-radius:50%;flex-shrink:0;"></div>
          <div style="flex:1;height:1px;background:linear-gradient(90deg,rgba(150,108,8,.6),transparent);"></div>
        </div>
        <div style="font-size:9.5px;font-style:italic;color:rgba(255,255,255,0.82);letter-spacing:.08em;text-transform:uppercase;">
          ${escapeHTML(SS.motto || 'Wisdom, Knowledge and Success')}
        </div>
        <div style="font-size:8.5px;color:rgba(255,255,255,0.75);margin-top:2px;line-height:1.4;">
          ${escapeHTML(SS.address || '')}
        </div>
        <div style="font-size:8px;color:rgba(255,255,255,0.65);">
          ${escapeHTML([SS.phone1, SS.phone2, SS.email].filter(Boolean).join('  ·  '))}
        </div>
        <div style="margin-top:5px;display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.14);border:0.5px solid rgba(255,255,255,.4);border-radius:20px;padding:2.5px 14px;">
          <div style="width:16px;height:0.5px;background:rgba(255,255,255,.5);"></div>
          <div style="font-size:9px;font-weight:800;color:#FFFFFF;text-transform:uppercase;letter-spacing:.15em;">
            ${escapeHTML(myLabel)} Terminal Report Card
          </div>
          <div style="width:16px;height:0.5px;background:rgba(255,255,255,.5);"></div>
        </div>
      </div>

      <div style="flex-shrink:0;display:flex;flex-direction:row;align-items:center;gap:4px;">
        ${
          student?.avatar_url
            ? `<img src="${student.avatar_url}" style="width:50px;height:60px;object-fit:cover;border:2px solid rgba(255,255,255,.4);border-radius:4px;display:block;">`
            : `<div style="width:50px;height:60px;border:1.5px dashed rgba(255,255,255,.35);border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;"><div style="font-size:16px;opacity:.5;">📷</div><div style="font-size:7px;color:rgba(255,255,255,.55);letter-spacing:.05em;">PHOTO</div></div>`
        }
        <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
          <div style="width:50px;height:50px;background:#ffffff;border-radius:3px;border:1.5px solid rgba(255,255,255,.4);display:flex;align-items:center;justify-content:center;overflow:hidden;padding:2px;box-sizing:border-box;">
            ${
              qrDataUrl
                ? `<img src="${qrDataUrl}" alt="QR" style="width:100%;height:100%;object-fit:contain;display:block;">`
                : `<div style="font-size:7px;color:#B0A488;text-align:center;line-height:1.3;letter-spacing:.04em;">QR<br>N/A</div>`
            }
          </div>
          <div style="font-size:6.5px;color:rgba(255,255,255,.65);letter-spacing:.05em;text-align:center;">SCAN TO VERIFY</div>
        </div>
      </div>
    </div>
  </div><!-- end header -->

  <div style="height:2px;background:linear-gradient(90deg,#2C1810 0%,#C8960C 30%,#F0C040 50%,#C8960C 70%,#2C1810 100%);"></div>

  <!-- ════ STUDENT INFORMATION BAND ════ -->
  <div style="background:#F5ECD7;border-bottom:2px solid #4A2C1F;padding:${iPd};">
    <div style="display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #C0A882;border-radius:5px;overflow:hidden;">
      ${[
        ['Name', fmtStuName(student?.full_name) || '—'],
        [myLabel + ' No', student?.admission_number || '—'],
        ['Class', student?.class_name || '—'],
        ['Session', sess || '—'],
        ['Term', term || '—'],
        ['Position', ord(pos)],
        ['Average', avg + '%'],
        [studentsOrPupilsInClass, String(classCount)],
      ]
        .map(
          (f, i) => `
        <div style="padding:4.5px 7px;background:${i < 4 ? '#fff' : '#FAF3E8'};${i % 4 !== 3 ? 'border-right:1px solid #C0A882;' : ''}${i >= 4 ? 'border-top:1px solid #C0A882;' : ''}">
          <div style="font-size:9px;font-weight:800;color:#8D6E63;text-transform:uppercase;letter-spacing:.08em;">${escapeHTML(f[0])}</div>
          <div style="font-size:14px;font-weight:700;color:#2C1810;margin-top:1px;line-height:1.3;">${escapeHTML(String(f[1]))}</div>
        </div>`
        )
        .join('')}
    </div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:4px;flex-wrap:wrap;row-gap:3px;">
      <div style="background:${pfColor}18;border:1.5px solid ${pfColor};border-radius:20px;padding:3px 15px;font-size:13px;font-weight:800;color:${pfColor};letter-spacing:.1em;">${pf}</div>
      <div style="font-size:11.5px;color:#8D6E63;">Total Marks: <strong style="color:#2C1810;font-size:13px;">${grand}</strong> / <strong style="color:#2C1810;font-size:13px;">${totalObtainable}</strong> obtainable</div>
      <div style="font-size:11.5px;color:#8D6E63;">&ensp;·&ensp;Term Ends: <strong style="color:#2C1810;">${termEndStr}</strong></div>
      <div style="font-size:11.5px;color:#8D6E63;">&ensp;·&ensp;Next Term Begins: <strong style="color:#2C1810;">${nextTermStr}</strong></div>
    </div>
  </div>

  <!-- ════ ACADEMIC PERFORMANCE + GRADE SCALE ════ -->
  <div style="padding:${aPd};display:flex;gap:7px;border-bottom:1px solid #E5D9C5;background:#fff;">
    <div style="flex:1;min-width:0;">
      <div style="font-size:9.5px;font-weight:800;color:#8D6E63;text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px;">Academic Performance</div>
      <table style="width:100%;border-collapse:collapse;border:1px solid #C0A882;border-radius:3px;overflow:hidden;">
        <thead>
          <tr style="background:linear-gradient(135deg,#1F120D 0%,#3B2013 100%);">
            <th style="padding:3.5px 5px;border-right:1.5px solid #C8A870;font-size:11px;text-align:left;color:#F5ECD7;font-weight:700;letter-spacing:.03em;">Subject</th>
            <th style="padding:3.5px 4px;border-right:1.5px solid #C8A870;font-size:10.5px;text-align:center;color:#C8A870;font-weight:600;">CA<br><span style="font-size:8.5px;opacity:.8;">(30)</span></th>
            <th style="padding:3.5px 4px;border-right:1.5px solid #C8A870;font-size:10.5px;text-align:center;color:#C8A870;font-weight:600;">Exam<br><span style="font-size:8.5px;opacity:.8;">(70)</span></th>
            <th style="padding:3.5px 4px;border-right:1.5px solid #C8A870;font-size:11px;text-align:center;color:#F5ECD7;font-weight:800;">Total</th>
            <th style="padding:3.5px 4px;border-right:1.5px solid #C8A870;font-size:11px;text-align:center;color:#F5ECD7;font-weight:800;">Grade</th>
            <th style="padding:3.5px 5px;font-size:10.5px;text-align:left;color:#C8A870;font-weight:600;">Remark</th>
          </tr>
        </thead>
        <tbody>${subjectRows}</tbody>
        <tfoot>
          <tr style="background:linear-gradient(90deg,#F5ECD7,#EDE0C4);border-top:2px solid #4A2C1F;">
            <td colspan="3" style="padding:3.5px 5px;font-size:12.5px;font-weight:800;color:#2C1810;letter-spacing:.03em;">Grand Total / Average</td>
            <td style="padding:3.5px 4px;text-align:center;font-size:14px;font-weight:800;color:#2C1810;">${grand}</td>
            <td colspan="2" style="padding:3.5px 5px;font-size:12.5px;font-weight:800;color:${pfColor};">${avg}% — ${pf}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div style="width:112px;flex-shrink:0;">
      <div style="font-size:9.5px;font-weight:800;color:#8D6E63;text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px;">Grading Scale</div>
      <table style="width:100%;border-collapse:collapse;border:1px solid #C0A882;">
        <thead><tr style="background:linear-gradient(135deg,#1F120D,#3B2013);">
          <th style="padding:2.5px 4px;font-size:8.5px;color:#F5ECD7;font-weight:700;">Score</th>
          <th style="padding:2.5px 3px;font-size:8.5px;color:#F5ECD7;font-weight:700;">Gr.</th>
          <th style="padding:2.5px 4px;font-size:8.5px;color:#C8A870;font-weight:600;">Remark</th>
        </tr></thead>
        <tbody>${gradeScale}</tbody>
      </table>
      <div style="margin-top:4px;background:#F5ECD7;border:1px solid #C0A882;border-radius:4px;padding:5px 6px;">
        <div style="font-size:9px;font-weight:900;color:#241209;margin-bottom:3px;text-transform:uppercase;letter-spacing:.05em;">Pass / Fail Rule</div>
        <div style="font-size:8.5px;color:#6B4F3A;margin-bottom:1px;">0–43% → <span style="color:#B91C1C;font-weight:900;">FAIL</span></div>
        <div style="font-size:8.5px;color:#6B4F3A;">44–100% → <span style="color:#15803D;font-weight:900;">PASS</span></div>
      </div>
      <div style="margin-top:9px;background:#F5ECD7;border:1px solid #C0A882;border-radius:4px;padding:4px 6px;position:relative;">
        <div style="position:absolute;top:-5px;left:8px;right:8px;height:1.5px;background:repeating-linear-gradient(90deg,#B08D57 0,#B08D57 4px,transparent 4px,transparent 8px);"></div>
        <div style="font-size:8.5px;font-weight:900;color:#241209;margin-bottom:2px;text-transform:uppercase;letter-spacing:.05em;">Affective Trait Scale</div>
        <table style="width:100%;border-collapse:collapse;">
          <tbody>${affectiveScale}</tbody>
        </table>
      </div>
    </div>
  </div><!-- end academic -->

  <!-- ════ AFFECTIVE DOMAIN ASSESSMENT ════ -->
  <div style="padding:${tdPd};border-bottom:1px solid #E5D9C5;background:#fff;">
    <div style="font-size:12px;font-weight:900;color:#4A2C1F;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;">Affective Domain Assessment</div>
    <div style="display:flex;gap:8px;">${traitColHTML}</div>
  </div>

  <!-- ════ COMMENTS ════ -->
  <div style="padding:${tdPd};border-bottom:1px solid #E5D9C5;display:grid;grid-template-columns:1fr 1fr;gap:8px;background:#fff;">
    <div>
      <div style="font-size:10.5px;font-weight:800;color:#8D6E63;text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px;">Class Teacher's Comment</div>
      <div id="tc-comment-box"
        style="font-size:13px;color:#2C1810;font-style:italic;background:#F5ECD7;border:1px solid #C0A882;border-left:3px solid #4A2C1F;border-radius:4px;padding:5px 8px;${forPDF ? '' : 'cursor:pointer;'}line-height:1.6;min-height:28px;"
        ${forPDF ? '' : `title="Click to edit" onclick="editComment('tc-comment-box','${tcCommentEsc}')"`}>
        ${tcComment}
      </div>
    </div>
    <div>
      <div style="font-size:10.5px;font-weight:800;color:#8D6E63;text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px;">${escapeHTML(htTitle)}'s Comment</div>
      <div id="pc-comment-box"
        style="font-size:13px;color:#2C1810;font-style:italic;background:#F5ECD7;border:1px solid #C0A882;border-left:3px solid #4A2C1F;border-radius:4px;padding:5px 8px;${forPDF ? '' : 'cursor:pointer;'}line-height:1.6;min-height:28px;"
        ${forPDF ? '' : `title="Click to edit" onclick="editComment('pc-comment-box','${pcCommentEsc}')"`}>
        ${pcComment}
      </div>
    </div>
  </div>

  <!-- ════ SIGNATURES ════ -->
  <div style="padding:${spPd};border-bottom:1px solid #E5D9C5;display:grid;grid-template-columns:1fr 1fr;gap:14px;background:#fff;align-items:flex-end;">
    <div style="text-align:center;">
      ${
        ctSig
          ? `<img src="${ctSig}" style="height:42px;object-fit:contain;margin-bottom:3px;display:block;margin-left:auto;margin-right:auto;">`
          : '<div style="height:42px;"></div>'
      }
      <div style="height:1px;background:linear-gradient(90deg,transparent,#4A2C1F 30%,#4A2C1F 70%,transparent);margin-bottom:4px;"></div>
      <div style="font-size:10px;color:#8D6E63;letter-spacing:.04em;">Class Teacher's Signature &amp; Date</div>
      <div style="font-size:13px;font-weight:700;color:#2C1810;margin-top:2px;">${escapeHTML(ctName || '________________________')}</div>
      ${ctTitle ? `<div style="font-size:10.5px;color:#8D6E63;font-style:italic;margin-top:1px;">${escapeHTML(ctTitle)}</div>` : ''}
    </div>
    <div style="display:flex;align-items:flex-end;justify-content:center;gap:10px;">
      <div style="text-align:center;flex:1;min-width:0;">
        ${
          htSig
            ? `<img src="${htSig}" style="height:42px;object-fit:contain;margin-bottom:3px;display:block;margin-left:auto;margin-right:auto;">`
            : '<div style="height:42px;"></div>'
        }
        <div style="height:1px;background:linear-gradient(90deg,transparent,#4A2C1F 30%,#4A2C1F 70%,transparent);margin-bottom:4px;"></div>
        <div style="font-size:10px;color:#8D6E63;letter-spacing:.04em;">${escapeHTML(htTitle)}'s Signature &amp; Stamp</div>
        <div style="font-size:13px;font-weight:700;color:#2C1810;margin-top:2px;">${escapeHTML(htName || '________________________')}</div>
        ${htTitle ? `<div style="font-size:10.5px;color:#8D6E63;font-style:italic;margin-top:1px;">${escapeHTML(htTitle)}</div>` : ''}
      </div>
      <div style="flex-shrink:0;">
        ${
          htStamp
            ? `<img src="${htStamp}" style="height:58px;width:58px;object-fit:contain;display:block;">`
            : `<div style="border:1px dashed #C0A882;border-radius:50%;height:52px;width:52px;display:flex;align-items:center;justify-content:center;font-size:7px;color:#C0A882;letter-spacing:.06em;text-transform:uppercase;text-align:center;line-height:1.2;">Official<br>Stamp</div>`
        }
      </div>
    </div>
  </div>

  <!-- ════ PREMIUM FOOTER BAND ════ -->
  <div style="padding:4px 12px;background:linear-gradient(135deg,#1F120D 0%,#3B2013 100%);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:3px;">
    <div style="font-size:8.5px;color:#C8A870;">Generated: ${genDate}</div>
    <div style="font-size:8.5px;color:#9A7A5A;">Scan QR &bull; PIN: <strong style="color:#C8A870;letter-spacing:.06em;">${qrPin || '—'}</strong></div>
    <div style="font-size:8.5px;font-style:italic;color:#C8A870;">"${escapeHTML(SS.motto || 'Wisdom, Knowledge and Success')}"</div>
  </div>

  <div style="height:3px;background:linear-gradient(90deg,#5D4037 0%,#C8960C 35%,#F0C040 50%,#C8960C 65%,#5D4037 100%);"></div>

</div>${
    forPDF
      ? ''
      : `
<div style="display:flex;gap:11px;margin-top:14px;" class="no-print">
  <button onclick="window.print()" class="btn btn-primary"><i class="fas fa-print"></i> Print</button>
  <button onclick="downloadResultPDF()" class="btn btn-outline"><i class="fas fa-file-pdf"></i> Download PDF</button>
</div>`
  }`;
}
