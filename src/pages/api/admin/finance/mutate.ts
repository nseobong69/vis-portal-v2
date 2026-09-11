import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

const FINANCE_ROLES = ['super_admin', 'admin', 'proprietor', 'bursar'];

// NOTE ON SCOPE: this covers the fee ledger (create/record/delete a
// student's fee_payments row) and expenditures CRUD — the two remaining
// pieces of renderFinance() that are plain data entry. Actual payment
// processing (Paystack checkout, webhooks, bulk-pay-via-gateway,
// index.html's showPaySystem()/showBulkCashModal()) needs live Paystack
// API keys and a webhook endpoint this environment can't provision or
// test, so it isn't ported — "Record Payment" here is the manual/cash
// equivalent (same as the old app's own Bulk Cash / manual-approval path,
// not the card-payment path).
//
// createInvoicesBulk added: the old app's showFeeModal() always creates
// invoices for a whole class at once (with per-student New/Old-student
// amount overrides), not one at a time. createInvoice (singular) is kept
// for backward compatibility but the UI now uses the bulk action.

interface StudentTarget {
  studentId: string;
  studentName: string;
  admissionNumber: string;
  className: string;
  amount: number;
  amountPaid?: number;
}

interface Body {
  action: 'createInvoice' | 'createInvoicesBulk' | 'recordPayment' | 'deleteInvoice' | 'addExpenditure' | 'deleteExpenditure' | 'studentsByClass';
  id?: string;
  classId?: string;
  studentId?: string;
  studentName?: string;
  admissionNumber?: string;
  className?: string;
  feeType?: string;
  amount?: number;
  amountPaid?: number;
  term?: string;
  session?: string;
  reason?: string;
  date?: string;
  expAmount?: number;
  targets?: StudentTarget[];
  method?: string;
  reference?: string;
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

  if (body.action === 'studentsByClass') {
    if (!body.classId) return new Response(JSON.stringify({ error: 'Missing classId.' }), { status: 400 });
    const { data, error } = await supabase
      .from('students')
      .select('id, full_name, admission_number, class_name, student_type')
      .eq('class_id', body.classId)
      .order('full_name');
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ students: data || [] }), { status: 200 });
  }

  if (body.action === 'createInvoice') {
    if (!body.studentId || !body.feeType || !body.amount || !body.term || !body.session) {
      return new Response(JSON.stringify({ error: 'Student, fee type, amount, term and session are all required.' }), { status: 400 });
    }
    const amount = Number(body.amount);
    const paid = Number(body.amountPaid) || 0;
    const bal = Math.max(0, amount - paid);
    const status = bal <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    const record = {
      student_id: body.studentId,
      student_name: body.studentName || null,
      admission_number: body.admissionNumber || null,
      class_name: body.className || null,
      fee_type: body.feeType,
      amount,
      amount_paid: paid || null,
      status,
      payment_method: paid > 0 ? 'Cash' : null,
      approved_by: paid > 0 ? auth.userId : null,
      term: body.term,
      session: body.session,
      created_by: auth.userId,
      paid_at: paid > 0 ? new Date().toISOString() : null,
    };
    const { data, error } = await supabase.from('fee_payments').insert(record).select().single();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true, invoice: data }), { status: 200 });
  }

  // Bulk path — mirrors showFeeModal()/saveInvoices(): one invoice per
  // selected student, each can carry its own resolved amount (the
  // New-student vs Old-student split happens client-side before this
  // is called; by the time it gets here every target already has its
  // final per-student amount).
  if (body.action === 'createInvoicesBulk') {
    if (!body.targets?.length || !body.feeType || !body.term || !body.session) {
      return new Response(JSON.stringify({ error: 'At least one student, fee type, term and session are required.' }), { status: 400 });
    }
    const records = body.targets.map((t) => {
      const amount = Number(t.amount) || 0;
      const paid = Number(t.amountPaid) || 0;
      const bal = Math.max(0, amount - paid);
      const status = bal <= 0 && amount > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
      return {
        student_id: t.studentId,
        student_name: t.studentName || null,
        admission_number: t.admissionNumber || null,
        class_name: t.className || null,
        fee_type: body.feeType,
        amount,
        amount_paid: paid || null,
        status,
        payment_method: paid > 0 ? 'Cash' : null,
        approved_by: paid > 0 ? auth.userId : null,
        term: body.term,
        session: body.session,
        created_by: auth.userId,
        paid_at: paid > 0 ? new Date().toISOString() : null,
      };
    });
    const { data, error } = await supabase.from('fee_payments').insert(records).select();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true, invoices: data, count: data?.length || 0 }), { status: 200 });
  }

  if (body.action === 'recordPayment') {
    if (!body.id || body.amountPaid == null) {
      return new Response(JSON.stringify({ error: 'Missing invoice id or amount.' }), { status: 400 });
    }
    const { data: existing, error: fetchErr } = await supabase.from('fee_payments').select('amount').eq('id', body.id).single();
    if (fetchErr || !existing) return new Response(JSON.stringify({ error: 'Invoice not found.' }), { status: 404 });
    const paid = Number(body.amountPaid);
    const bal = Math.max(0, Number(existing.amount) - paid);
    const status = bal <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    // ADDED: method/reference — previously hardcoded to 'Cash', which
    // was correct for the manual path but wrong once a real Paystack
    // payment comes through runPaystackFee() equivalent below. Verified
    // Paystack payments MUST pass method:'Paystack' + the real Paystack
    // reference here, never a client-asserted 'paid' with no reference.
    const { error } = await supabase
      .from('fee_payments')
      .update({
        amount_paid: paid,
        status,
        payment_method: body.method || 'Cash',
        transaction_ref: body.reference || null,
        approved_by: auth.userId,
        paid_at: new Date().toISOString(),
      })
      .eq('id', body.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true, status }), { status: 200 });
  }

  if (body.action === 'deleteInvoice') {
    if (!body.id) return new Response(JSON.stringify({ error: 'Missing invoice id.' }), { status: 400 });
    const { error } = await supabase.from('fee_payments').delete().eq('id', body.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  if (body.action === 'addExpenditure') {
    const reason = (body.reason || '').trim();
    const amount = Number(body.expAmount);
    if (!reason) return new Response(JSON.stringify({ error: 'Enter a reason for this expenditure.' }), { status: 400 });
    if (!body.date) return new Response(JSON.stringify({ error: 'Select a date.' }), { status: 400 });
    if (!amount || amount <= 0) return new Response(JSON.stringify({ error: 'Enter a valid amount.' }), { status: 400 });
    const record = {
      reason,
      date: body.date,
      amount,
      recorded_by: auth.userId,
      session: body.session || null,
      term: body.term || null,
    };
    const { data, error } = await supabase.from('expenditures').insert(record).select().single();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true, expenditure: data }), { status: 200 });
  }

  if (body.action === 'deleteExpenditure') {
    if (!body.id) return new Response(JSON.stringify({ error: 'Missing expenditure id.' }), { status: 400 });
    const { error } = await supabase.from('expenditures').delete().eq('id', body.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Unknown action.' }), { status: 400 });
};
