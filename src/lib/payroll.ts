// ═══════════════════════════════════════════════════════════════════════════
// STAFF PAYROLL — pure helpers, ported from index.html ~L20557-20577.
// Isomorphic (no DOM/Supabase) so the same math runs server-side (payroll
// generation) as would run client-side if ever needed.
// ═══════════════════════════════════════════════════════════════════════════

/** Mirrors _currentPayrollPeriod() — "YYYY-MM" for the current month. */
export function currentPayrollPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Mirrors _payrollPeriodLabel() — "YYYY-MM" -> "September 2026". */
export function payrollPeriodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export interface StaffPayFields {
  basic_salary?: number | string | null;
  allowance_housing?: number | string | null;
  allowance_transport?: number | string | null;
  allowance_other?: number | string | null;
  deduction_tax?: number | string | null;
  deduction_pension?: number | string | null;
  deduction_other?: number | string | null;
}

export interface PayLine {
  basic: number;
  housing: number;
  transport: number;
  otherAll: number;
  gross: number;
  tax: number;
  pension: number;
  otherDed: number;
  totalDed: number;
  net: number;
}

/** Mirrors _computePayLine(s). */
export function computePayLine(s: StaffPayFields): PayLine {
  const basic = parseFloat(String(s.basic_salary)) || 0;
  const housing = parseFloat(String(s.allowance_housing)) || 0;
  const transport = parseFloat(String(s.allowance_transport)) || 0;
  const otherAll = parseFloat(String(s.allowance_other)) || 0;
  const gross = basic + housing + transport + otherAll;
  const tax = parseFloat(String(s.deduction_tax)) || 0;
  const pension = parseFloat(String(s.deduction_pension)) || 0;
  const otherDed = parseFloat(String(s.deduction_other)) || 0;
  const totalDed = tax + pension + otherDed;
  const net = gross - totalDed;
  return { basic, housing, transport, otherAll, gross, tax, pension, otherDed, totalDed, net };
}
