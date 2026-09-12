export function classNamePinPrefix(name: string): string {
  const n = (name || '').trim().toLowerCase();
  if (/kindergarten.*lower|lower.*kindergarten|^lk\b|k\.?g\.?\s*1\b/.test(n)) return 'LK';
  if (/kindergarten.*upper|upper.*kindergarten|^uk\b|k\.?g\.?\s*2\b/.test(n)) return 'UK';
  let m: RegExpMatchArray | null;
  if ((m = n.match(/nursery\s*0*(\d+)/))) return 'N' + m[1];
  if ((m = n.match(/primary\s*0*(\d+)/))) return 'P' + m[1];
  if ((m = n.match(/jss\s*0*(\d+)/))) return 'JS' + m[1];
  if ((m = n.match(/sss\s*0*(\d+)/))) return 'SS' + m[1];
  if (/^nursery$/.test(n)) return 'N1';
  if (/^primary$/.test(n)) return 'P1';
  const stripped = n.replace(/[^a-z0-9]/gi, '').toUpperCase();
  return stripped.slice(0, 3) || 'CLS';
}

export function termPinDigit(term: string): string {
  const t = (term || '').toLowerCase();
  if (t.startsWith('1')) return '1';
  if (t.startsWith('2')) return '2';
  if (t.startsWith('3')) return '3';
  return '1';
}

export function rpBuildPrefix(className: string, session: string, term: string): string {
  const prefix = classNamePinPrefix(className);
  const sessNorm = (session || '').replace(/\s+/g, '');
  return `${prefix}/${sessNorm}/${termPinDigit(term)}`;
}

export function rpFullPin(className: string, session: string, term: string, suffix: string): string {
  return `${rpBuildPrefix(className, session, term)}/${suffix}`;
}

// Same 6-char case-sensitive alphabet as rpGenSuffix() — a real CSPRNG
// draw (crypto.getRandomValues), not Math.random(), matching the old
// app's own comment that anything with security/uniqueness impact must
// use the secure helper.
const SUFFIX_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
export function rpGenSuffix(): string {
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => SUFFIX_ALPHABET[n % SUFFIX_ALPHABET.length]).join('');
}

// Ported from fmtStuName() (index.html ~L5559) — "Surname First Other"
// stored full_name displayed as "Surname, First Other".
export function fmtStuName(full?: string): string {
  const f = (full || '').trim();
  if (!f || f === '—') return f || '—';
  const sp = f.indexOf(' ');
  if (sp < 0) return f;
  return f.slice(0, sp) + ', ' + f.slice(sp + 1);
}

// Ported from _secureRandStr()/_secureCode8() (index.html ~L5583-5599) —
// a real CSPRNG draw, same alphabet convention (no O/0/I/l confusion
// characters) used for aptitude codes (10 chars) and CBT codes (8 chars).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function secureCode(len: number): string {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => CODE_ALPHABET[n % CODE_ALPHABET.length]).join('');
}
