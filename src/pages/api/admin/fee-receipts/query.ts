import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

// Same access list as renderFeeReceipts() (index.html ~24965).
const ALLOWED = ['super_admin', 'admin', 'proprietor', 'bursar', 'cashier'];

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ALLOWED);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Access denied.' }), { status: 401 });
  }

  let body: { classId?: string; session?: string; term?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }

  const supabase = createServerSupabase(cookies);
  const { classId = '', session = '', term = '' } = body;

  // ── Admission Applicants view: unenrolled payers have no student_id,
  // so they need their own query path, exactly like loadFeeReceipts()'s
  // clsId==='__applicants__' branch (index.html ~25000-25017). ──────────
  if (classId === '__applicants__') {
    let q = supabase.from('fee_payments').select('*').is('student_id', null).ilike('fee_type', 'Admission Fee%');
    if (session) q = q.eq('session', session);
    if (term) q = q.eq('term', term);
    const { data: rows, error } = await q.order('paid_at', { ascending: false });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ mode: 'applicants', rows: rows || [] }), { status: 200 });
  }

  // ── Students view: invoices AND payments both live in fee_payments
  // (amount = invoiced, amount_paid = collected) — no separate
  // fee_assignments table, per the old app's own comment (~25040). ──────
  let sq = supabase.from('students').select('id, full_name, admission_number, class_id, class_name');
  if (classId) sq = sq.eq('class_id', classId);
  const { data: students, error: se } = await sq.order('full_name');
  if (se) return new Response(JSON.stringify({ error: se.message }), { status: 500 });

  let fpq = supabase.from('fee_payments').select('*');
  if (session) fpq = fpq.eq('session', session);
  if (term) fpq = fpq.eq('term', term);
  const { data: payments, error: pe } = await fpq;
  if (pe) return new Response(JSON.stringify({ error: pe.message }), { status: 500 });

  const rows = (students || []).map((s) => {
    const stuFee = (payments || []).filter((p) => p.student_id === s.id);
    const totalInvoice = stuFee.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const totalPaid = stuFee.reduce((sum, p) => sum + (parseFloat(p.amount_paid) || 0), 0);
    return { student: s, totalInvoice, totalPaid };
  });

  return new Response(JSON.stringify({ mode: 'students', rows }), { status: 200 });
};
