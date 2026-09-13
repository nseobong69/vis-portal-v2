import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

// Same role list Phase 0's table gives Student Clearance (row 20):
// super_admin, admin, proprietor, head_teacher, principal, bursar.
// Narrower than FINANCE_ROLES in api/admin/finance/mutate.ts (no
// head_teacher/principal there) — Clearance is a distinct checklist row
// with its own allowed list, not an alias of Finance.
const CLEARANCE_ROLES = ['super_admin', 'admin', 'proprietor', 'head_teacher', 'principal', 'bursar'];

// Ports the three actions index.html's renderClearance() actually
// performs (index.html ~L14882-14910):
//   savePaymentRecord() -> recordPayment  (insert one fee_payments row,
//     then cleared is set to true only on a full 'paid' record, and
//     explicitly set to false on 'partial' — 'unpaid'/'cash' leave the
//     student's existing cleared value untouched, matching the old
//     app's own `if(status==='paid'||status==='partial')` guard exactly)
//   setClear()    -> setCleared          (students.cleared toggle)
//   blockResult() -> setResultsBlocked   (students.results_blocked toggle)
//
// NOT ported here, same as api/admin/finance/mutate.ts's own header
// comment: real Paystack checkout for this modal. The old app's
// showRecordPaymentModal() itself never touched Paystack either — the
// 'cash' status is the old app's own "pending, meet the Bursar in
// school" path, kept as-is.
interface Body {
  action: 'recordPayment' | 'setCleared' | 'setResultsBlocked';
  studentId?: string;
  className?: string;
  feeType?: string;
  amount?: number;
  amountPaid?: number;
  status?: 'paid' | 'partial' | 'unpaid' | 'cash';
  term?: string;
  session?: string;
  id?: string;
  value?: boolean;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, CLEARANCE_ROLES);
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

  if (body.action === 'recordPayment') {
    const feeType = (body.feeType || '').trim();
    const amount = Number(body.amount);
    const status = body.status || 'paid';
    // Was: parseFloat(...)||0 with no lower bound — kept the old app's
    // own permissiveness (an amountPaid of 0 is valid for 'unpaid').
    const amountPaid = Number(body.amountPaid) || 0;

    if (!body.studentId) return new Response(JSON.stringify({ error: 'Missing student id.' }), { status: 400 });
    if (!feeType) return new Response(JSON.stringify({ error: 'Fee type is required.' }), { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0) {
      return new Response(JSON.stringify({ error: 'Total fee amount is required.' }), { status: 400 });
    }

    const { data: stu, error: stuErr } = await supabase
      .from('students')
      .select('full_name, admission_number')
      .eq('id', body.studentId)
      .single();
    if (stuErr || !stu) return new Response(JSON.stringify({ error: 'Student not found.' }), { status: 404 });

    const record = {
      student_id: body.studentId,
      student_name: stu.full_name || '',
      admission_number: stu.admission_number || '',
      class_name: body.className || '',
      fee_type: feeType,
      amount,
      amount_paid: amountPaid,
      status: status === 'cash' ? 'pending' : status,
      payment_method: status === 'cash' ? 'Cash (pending)' : 'Manual',
      approved_by: auth.userId,
      term: body.term || null,
      session: body.session || null,
      created_by: auth.userId,
    };
    const { error: insertErr } = await supabase.from('fee_payments').insert(record);
    if (insertErr) return new Response(JSON.stringify({ error: insertErr.message }), { status: 500 });

    // Exact old-app guard: only a 'paid' or 'partial' record touches
    // `cleared` at all — 'unpaid'/'cash' leave whatever it already was.
    if (status === 'paid' || status === 'partial') {
      const { error: updErr } = await supabase
        .from('students')
        .update({ cleared: status === 'paid' })
        .eq('id', body.studentId);
      if (updErr) return new Response(JSON.stringify({ error: updErr.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true, cash: status === 'cash' }), { status: 200 });
  }

  if (body.action === 'setCleared') {
    if (!body.id || body.value == null) return new Response(JSON.stringify({ error: 'Missing student id or value.' }), { status: 400 });
    const { error } = await supabase.from('students').update({ cleared: body.value }).eq('id', body.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  if (body.action === 'setResultsBlocked') {
    if (!body.id || body.value == null) return new Response(JSON.stringify({ error: 'Missing student id or value.' }), { status: 400 });
    const { error } = await supabase.from('students').update({ results_blocked: body.value }).eq('id', body.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Unknown action.' }), { status: 400 });
};
