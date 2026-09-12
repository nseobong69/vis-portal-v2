// Direct port of _reorderNameFull() (index.html lines 7994-8007).
export function reorderNameFull(full: string, surnameIdx: number | null, firstIdx: number | null): string {
  const parts = (full || '').trim().split(/\s+/).filter(Boolean);
  if (surnameIdx == null || isNaN(surnameIdx) || surnameIdx < 0 || surnameIdx >= parts.length) return full;
  const surname = parts[surnameIdx];
  let firstName: string | null = null;
  const usedIdx = new Set([surnameIdx]);
  if (firstIdx != null && !isNaN(firstIdx) && firstIdx >= 0 && firstIdx < parts.length && firstIdx !== surnameIdx) {
    firstName = parts[firstIdx];
    usedIdx.add(firstIdx);
  }
  const middle = parts.filter((_, i) => !usedIdx.has(i));
  const tail = [firstName, ...middle].filter(Boolean) as string[];
  return surname + (tail.length ? ' ' + tail.join(' ') : '');
}

// fmtStuName() (index.html line 5559-ish) — students display as
// "Surname, First Middle"; staff display as plain full name (the old
// app's staff tab never applies this formatter).
export function fmtStuName(full: string | null | undefined): string {
  const f = (full || '').trim();
  if (!f || f === '—') return f || '—';
  const sp = f.indexOf(' ');
  if (sp < 0) return f;
  return f.slice(0, sp) + ', ' + f.slice(sp + 1);
}
