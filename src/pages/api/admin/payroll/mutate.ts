import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';
import { computePayLine } from '../../../../lib/payroll';

export const prerender = false;

// Same restriction as the rest of Finance (index.html ~L13567: Admin,
// Bursar, School Director only) — Staff Payroll sits in the same
// old-app FINANCE menu group (~L6552) as Finance/Fee Receipts/Reminders.
const FINANCE_ROLES = ['super_admin', 'admin', 'proprietor', 'bursar'];

interface Body {
  action: 'generate' | 'markPaid' | 'markAllPaid';
  period?: string;
  id?: string;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, FINANCE_ROLES);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }

  const supabase = createServerSupabase(cookies);

  if (body.action === 'generate') {
    const period = body.period;
    if (!period) return new Response(JSON.stringify({ error: 'Missing period.' }), { status: 400 });

    const { data: staffList, error: staffErr } = await supabase.from('profiles').select('*').neq('role', 'student');
    if (staffErr) return new Response(JSON.stringify({ error: staffErr.message }), { status: 500 });
    const eligible = (staffList || []).filter((s: any) => (parseFloat(s.basic_salary) || 0) > 0);
    if (!eligible.length) {
      return new Response(JSON.stringify({ error: 'No staff with a basic salary set.' }), { status: 400 });
    }

    let created = 0;
    let skipped = 0;
    const errs: string[] = [];
    for (const s of eligible) {
      try {
        const { data: existing, error: exErr } = await supabase
          .from('payslips')
          .select('id')
          .eq('staff_id', s.id)
          .eq('period', period)
          .maybeSingle();
        if (exErr) {
          errs.push(`${s.full_name}: ${exErr.message}`);
          continue;
        }
        if (existing) {
          skipped++;
          continue;
        }
        const pay = computePayLine(s);
        const { error } = await supabase.from('payslips').insert({
          staff_id: s.id,
          staff_name: s.full_name,
          role: s.role,
          period,
          basic_salary: pay.basic,
          allowance_housing: pay.housing,
          allowance_transport: pay.transport,
          allowance_other: pay.otherAll,
          gross_pay: pay.gross,
          deduction_tax: pay.tax,
          deduction_pension: pay.pension,
          deduction_other: pay.otherDed,
          total_deductions: pay.totalDed,
          net_pay: pay.net,
          bank_name: s.staff_bank_name || null,
          bank_account_name: s.staff_bank_account_name || null,
          bank_account_number: s.staff_bank_account_number || null,
          status: 'generated',
          generated_by: auth.userId,
        });
        if (!error) created++;
        else errs.push(`${s.full_name}: ${error.message}`);
      } catch (e: any) {
        errs.push(`${s.full_name}: ${e.message || 'unexpected error'}`);
      }
    }

    const { data: slips } = await supabase.from('payslips').select('*').eq('period', period).order('staff_name');
    return new Response(JSON.stringify({ ok: true, created, skipped, errors: errs, slips: slips || [] }), { status: 200 });
  }

  if (body.action === 'markPaid') {
    if (!body.id) return new Response(JSON.stringify({ error: 'Missing payslip id.' }), { status: 400 });
    const { error } = await supabase.from('payslips').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', body.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  if (body.action === 'markAllPaid') {
    if (!body.period) return new Response(JSON.stringify({ error: 'Missing period.' }), { status: 400 });
    const { error } = await supabase
      .from('payslips')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('period', body.period)
      .neq('status', 'paid');
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    const { data: slips } = await supabase.from('payslips').select('*').eq('period', body.period).order('staff_name');
    return new Response(JSON.stringify({ ok: true, slips: slips || [] }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Unknown action.' }), { status: 400 });
};
