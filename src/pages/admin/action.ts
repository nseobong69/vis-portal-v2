import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

// Full port of approveAdm()/rejectAdm()/saveAdmPaymentConfirmation()/
// _autoCreateAdmissionFeeInvoice()/saveAdmFeeSettings()/
// saveAdmCBTSettings()/submitInternalAdm()/_buildAdmPayload()
// (index.html ~15307-15381, ~21788-21990, ~23705-23767). The 'create'
// action below is the internal "+ New Admission" intake form's submit
// handler, added in this pass. Still NOT covered: the 2-page PDF
// admission letter (generateAdmissionPDF(), ~360 lines — separate
// follow-up) and the confirmation email submitInternalAdm() sends on
// success (sendEmailDelivery() — same Email Center delivery-log system
// as the rest of this app, not wired up here yet).
const ADMIN_ROLES = ['super_admin', 'admin', 'proprietor'];

interface Body {
  action: 'approve' | 'reject' | 'confirmPayment' | 'delete' | 'saveFeeSettings' | 'saveCbtSettings' | 'create';
  id?: string;
  amountPaid?: number;
  paymentMethod?: string;
  admissionFeeDefault?: number;
  feeConfigs?: Record<string, number>;
  feeSections?: Record<string, number>;
  cbtConfigs?: Record<string, { required: boolean; class_name?: string; exam_title?: string }>;
  admission?: Record<string, unknown>;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ADMIN_ROLES);
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

  async function autoCreateAdmissionFeeInvoice(admissionRecord: any, studentId: string) {
    try {
      const clsName = (admissionRecord.class_admitted || admissionRecord.class_applied || '').trim();
      const { data: ss } = await supabase.from('school_settings').select('current_session, current_term').eq('id', 1).single();
      const sess = ss?.current_session || admissionRecord.session || '';
      const term = ss?.current_term || admissionRecord.term || '';

      const { data: configs } = await supabase
        .from('fee_configs').select('*')
        .eq('session', sess).eq('term', term).eq('is_admission_fee', true)
        .order('created_at', { ascending: false }).limit(5);
      if (!configs?.length) return;

      const cfg = configs[0];
      const amt = parseFloat(cfg.amount_new || cfg.amount || 0);
      if (!amt) return;

      const { data: exByStudent } = await supabase
        .from('fee_payments').select('id')
        .eq('student_id', studentId).eq('session', sess).eq('term', term)
        .ilike('fee_type', '%admission%').limit(1);
      if (exByStudent?.length) return;

      const { data: exApplicant } = await supabase
        .from('fee_payments').select('id, amount_paid, status')
        .is('student_id', null).eq('admission_number', admissionRecord.admission_number || '')
        .ilike('fee_type', '%admission%').order('created_at', { ascending: false }).limit(1);
      if (exApplicant?.length) {
        await supabase.from('fee_payments').update({ student_id: studentId, class_name: clsName, session: sess, term }).eq('id', exApplicant[0].id);
        return;
      }

      const { data: stu } = await supabase.from('students').select('full_name, admission_number').eq('id', studentId).single();
      const alreadyPaid = parseFloat(admissionRecord.amount_paid || 0);
      const status = alreadyPaid >= amt ? 'paid' : alreadyPaid > 0 ? 'partial' : 'unpaid';

      await supabase.from('fee_payments').insert({
        student_id: studentId,
        student_name: stu?.full_name || admissionRecord.full_name || '',
        admission_number: stu?.admission_number || admissionRecord.admission_number || '',
        class_name: clsName,
        fee_type: cfg.fee_name || 'Admission Fee',
        amount: amt,
        amount_paid: alreadyPaid > 0 ? Math.min(alreadyPaid, amt) : null,
        status,
        payment_method: admissionRecord.payment_method || null,
        approved_by: auth.userId,
        session: sess, term,
        created_by: auth.userId,
        paid_at: alreadyPaid > 0 ? new Date().toISOString() : null,
        transaction_ref: admissionRecord.paystack_ref || null,
      });
    } catch { /* best-effort, same as old app */ }
  }

  if (body.action === 'approve') {
    if (!body.id) return new Response(JSON.stringify({ error: 'Missing admission id.' }), { status: 400 });
    const { data: a } = await supabase.from('admissions').select('*').eq('id', body.id).single();
    if (!a) return new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 });

    if (a.payment_status === 'pending_confirmation' || (!a.amount_paid && a.admission_fee > 0 && a.payment_method !== 'paystack')) {
      return new Response(JSON.stringify({ error: 'Payment must be confirmed before approving admission.' }), { status: 400 });
    }

    await supabase.from('admissions').update({ status: 'approved' }).eq('id', body.id);

    const rawClass = (a.class_admitted || a.class_applied || '').trim();
    const baseClass = rawClass.replace(/\s+[A-Z]$/, '').trim();

    let assignedClassId: string | null = null, assignedClassName = rawClass;
    try {
      const { data: classOptions } = await supabase.from('classes').select('id, name, arm').ilike('name', baseClass.split(' ')[0] + '%');
      const matching = (classOptions || []).filter((c) => (c.name + (c.arm ? ' ' + c.arm : '')).toLowerCase().includes(baseClass.toLowerCase().split(' ')[0]));
      if (matching.length) {
        const pick = matching[Math.floor(Math.random() * matching.length)];
        assignedClassId = pick.id;
        assignedClassName = pick.name + (pick.arm ? ' ' + pick.arm : '');
      } else if (classOptions?.length) {
        assignedClassId = classOptions[0].id;
        assignedClassName = classOptions[0].name + (classOptions[0].arm ? ' ' + classOptions[0].arm : '');
      }
    } catch { /* fall through with rawClass, no id */ }

    let studentId: string | null = null;
    let message = '✅ Approved!';
    try {
      const admNum = a.admission_number || ('ADM/' + new Date().getFullYear() + '/' + Date.now().toString().slice(-5));
      const { data: existing } = await supabase.from('students').select('id').eq('full_name', a.full_name).maybeSingle();
      if (!existing) {
        const { data: newStu, error: insErr } = await supabase.from('students').insert({
          full_name: a.full_name,
          surname: (a.full_name || '').split(' ')[0] || a.full_name,
          first_name: (a.full_name || '').split(' ').slice(1).join(' ') || null,
          gender: a.gender || null,
          date_of_birth: a.date_of_birth || null,
          address: a.permanent_address || a.residential_address || null,
          parent_name: a.parent_name || null,
          parent_phone: a.phone || null,
          email: a.email || null,
          class_id: assignedClassId,
          class_name: assignedClassName,
          admission_number: admNum,
          student_type: 'new',
          has_account: false, blocked: false, cleared: false, scholarship: false,
          class_join_year: new Date().getFullYear(),
        }).select('id');
        if (!insErr && newStu?.length) {
          studentId = newStu[0].id;
          message = `✅ Approved! Student added to ${assignedClassName} (randomly assigned).`;
        } else {
          message = `✅ Approved! (Could not add to students: ${insErr?.message || 'unknown'})`;
        }
      } else {
        studentId = existing.id;
        await supabase.from('students').update({ class_id: assignedClassId, class_name: assignedClassName }).eq('id', studentId);
        message = `✅ Approved! (Student already in roster — class updated to ${assignedClassName})`;
      }
      await supabase.from('admissions').update({ class_admitted: assignedClassName }).eq('id', body.id);
    } catch (e: any) {
      message = `✅ Approved! (Could not auto-add to class: ${e.message})`;
    }

    if (studentId) await autoCreateAdmissionFeeInvoice(a, studentId);

    if (a.amount_paid > 0) {
      try {
        const { data: exReceipt } = await supabase.from('fee_receipts').select('id').eq('admission_number', a.admission_number || '').eq('payment_type', 'admission_fee').limit(1);
        if (!exReceipt?.length) {
          const { data: ss } = await supabase.from('school_settings').select('current_session, current_term').eq('id', 1).single();
          await supabase.from('fee_receipts').insert({
            student_name: a.full_name,
            admission_number: a.admission_number || '',
            class_name: assignedClassName,
            amount: a.amount_paid,
            payment_method: a.payment_method || '',
            payment_type: 'admission_fee',
            session: ss?.current_session || '',
            term: ss?.current_term || '',
            confirmed_by: a.confirmed_by || '',
          });
        }
      } catch { /* best-effort, same as old app */ }
    }

    return new Response(JSON.stringify({ ok: true, message, assignedClassName }), { status: 200 });
  }

  if (body.action === 'reject') {
    if (!body.id) return new Response(JSON.stringify({ error: 'Missing admission id.' }), { status: 400 });
    const { error } = await supabase.from('admissions').update({ status: 'rejected' }).eq('id', body.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  if (body.action === 'confirmPayment') {
    if (!body.id || !body.paymentMethod) {
      return new Response(JSON.stringify({ error: 'Missing admission id or payment method.' }), { status: 400 });
    }
    const { data: a } = await supabase.from('admissions').select('*').eq('id', body.id).single();
    if (!a) return new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 });

    const amt = Number(body.amountPaid) || 0;
    const fee = parseFloat(a.admission_fee) || 0;
    const pStatus = amt >= fee && fee > 0 ? 'paid' : amt > 0 ? 'partial' : 'unpaid';

    const { error } = await supabase.from('admissions').update({
      amount_paid: amt, payment_method: body.paymentMethod, payment_status: pStatus,
      confirmed_by: auth.userId, confirmed_at: new Date().toISOString(), status: 'pending',
    }).eq('id', body.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

    if (amt > 0) {
      try {
        const { data: existing } = await supabase.from('fee_payments').select('id')
          .eq('admission_number', a.admission_number || '__none__').eq('fee_type', 'Admission Fee (Applicant)').limit(1);
        if (!existing?.length) {
          const { data: ss } = await supabase.from('school_settings').select('current_session, current_term').eq('id', 1).single();
          const methodLabel = body.paymentMethod === 'cash' ? 'Cash' : body.paymentMethod === 'transfer' ? 'Bank Transfer' : body.paymentMethod === 'paystack' ? 'Paystack Online' : body.paymentMethod;
          await supabase.from('fee_payments').insert({
            student_id: null, student_name: a.full_name, admission_number: a.admission_number || '',
            class_name: a.class_applied || a.class_admitted || '', fee_type: 'Admission Fee (Applicant)',
            amount: fee || amt, amount_paid: amt, status: pStatus, payment_method: methodLabel,
            approved_by: auth.userId, session: ss?.current_session || '', term: ss?.current_term || '',
            paid_at: new Date().toISOString(),
          });
          await supabase.from('fee_receipts').insert({
            student_name: a.full_name, admission_number: a.admission_number || '',
            class_name: a.class_applied || a.class_admitted || '', amount: amt, payment_method: methodLabel,
            payment_type: 'admission_fee', session: ss?.current_session || '', term: ss?.current_term || '',
            confirmed_by: auth.userId,
          });
        }
      } catch { /* best-effort sync, same as old app */ }
    }

    return new Response(JSON.stringify({ ok: true, status: pStatus }), { status: 200 });
  }

  if (body.action === 'delete') {
    if (auth.role !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'Only Super Admin can delete admission applications.' }), { status: 403 });
    }
    if (!body.id) return new Response(JSON.stringify({ error: 'Missing admission id.' }), { status: 400 });
    const { data: a } = await supabase.from('admissions').select('admission_number').eq('id', body.id).single();
    if (a?.admission_number) {
      await supabase.from('fee_receipts').delete().eq('admission_number', a.admission_number).eq('payment_type', 'admission_fee');
      await supabase.from('fee_payments').delete().eq('admission_number', a.admission_number).eq('fee_type', 'Admission Fee (Applicant)');
    }
    const { error } = await supabase.from('admissions').delete().eq('id', body.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  if (body.action === 'saveFeeSettings') {
    const { error } = await supabase.from('school_settings').update({
      admission_fee_default: body.admissionFeeDefault ?? 0,
      admission_fee_configs: JSON.stringify(body.feeConfigs || {}),
      admission_fee_sections: JSON.stringify(body.feeSections || {}),
      updated_at: new Date().toISOString(),
    }).eq('id', 1);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  if (body.action === 'saveCbtSettings') {
    const { error } = await supabase.from('school_settings').update({
      admission_cbt_configs: JSON.stringify(body.cbtConfigs || {}),
      updated_at: new Date().toISOString(),
    }).eq('id', 1);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  if (body.action === 'create') {
    // Ported from submitInternalAdm()/_buildAdmPayload(false)
    // (index.html ~L23705-23767) — the internal "+ New Admission"
    // intake form. Same admission_fee resolution priority as
    // onAdmClassChange() (per-class override -> section fee ->
    // default), same payment_status derivation, same official_name/
    // confirmed_by stamping with the acting staff member.
    const a = body.admission || {};
    const fullName = String(a.full_name || '').trim();
    const classApplied = String(a.class_applied || '').trim();
    if (!fullName || !classApplied) {
      return new Response(JSON.stringify({ error: 'Name and class are required.' }), { status: 400 });
    }

    const { data: ssRow } = await supabase
      .from('school_settings')
      .select('admission_fee_default, admission_fee_sections, admission_fee_configs')
      .eq('id', 1).single();
    const defFee = parseFloat(String(ssRow?.admission_fee_default)) || 0;
    let secFees: Record<string, number> = {};
    try { secFees = typeof ssRow?.admission_fee_sections === 'string' ? JSON.parse(ssRow.admission_fee_sections) : (ssRow?.admission_fee_sections || {}); } catch { /* default {} */ }

    // Per-class fee configs (admission_fee_configs) — now fetched and used.
    // Full 3-priority chain matching onAdmClassChange() in the old app:
    //   1. exact per-class ID override (admission_fee_configs[class_id])
    //   2. section fee (admission_fee_sections[section])
    //   3. global default (admission_fee_default)
    let perClassConfigs: Record<string, number> = {};
    try { perClassConfigs = typeof ssRow?.admission_fee_configs === 'string' ? JSON.parse(ssRow.admission_fee_configs) : (ssRow?.admission_fee_configs || {}); } catch { /* default {} */ }

    // Resolve the class_id for the applied class name so we can look it up in perClassConfigs
    const { data: classRow } = await supabase.from('classes').select('id').ilike('name', classApplied.split(' ')[0] + '%').limit(10);
    const matchedClassId = (classRow || []).find((c: any) => {
      const label = (c.name + (c.arm ? ' ' + c.arm : '')).toLowerCase();
      return label.includes(classApplied.toLowerCase().split(' ')[0].toLowerCase());
    })?.id || null;

    const clsLow = classApplied.toLowerCase();
    let secKey: 'kindergarten' | 'nursery' | 'primary' | 'secondary' = 'secondary';
    if (/kindergarten|kinder|k\.g|kg\b/.test(clsLow)) secKey = 'kindergarten';
    else if (/nursery|nur/.test(clsLow)) secKey = 'nursery';
    else if (/primary|pri|pry/.test(clsLow)) secKey = 'primary';

    let fee = 0;
    if (matchedClassId && perClassConfigs[matchedClassId] && parseFloat(String(perClassConfigs[matchedClassId])) > 0) {
      fee = parseFloat(String(perClassConfigs[matchedClassId]));
    } else {
      const secFee = secFees[secKey] ? parseFloat(String(secFees[secKey])) : 0;
      fee = secFee > 0 ? secFee : defFee;
    }

    const amtPaid = Number(a.amount_paid) || 0;
    const paymentStatus = amtPaid >= fee && fee > 0 ? 'paid' : amtPaid > 0 ? 'partial' : 'unpaid';

    const { data: actingProfile } = await supabase.from('profiles').select('full_name').eq('id', auth.userId).maybeSingle();
    const actingName = actingProfile?.full_name || null;

    const payload = {
      full_name: fullName,
      class_applied: classApplied,
      class_admitted: String(a.class_admitted || '').trim() || classApplied,
      cbt_number: a.aptitude_code || null,
      aptitude_code: a.aptitude_code || null,
      aptitude_score: a.aptitude_score != null && a.aptitude_score !== '' ? Number(a.aptitude_score) : null,
      gender: a.gender || null,
      date_of_birth: a.date_of_birth || null,
      nationality: a.nationality || null,
      state_of_origin: a.state_of_origin || null,
      lga: a.lga || null,
      village: a.village || null,
      permanent_address: a.permanent_address || null,
      residential_address: a.residential_address || null,
      religion: a.religion || null,
      denomination: a.denomination || null,
      previous_school: a.previous_school || null,
      previous_class: a.previous_class || null,
      last_promoted_class: a.last_promoted_class || null,
      parent_name: a.parent_name || null,
      parent_relationship: a.parent_relationship || null,
      parent_address: a.parent_address || null,
      phone: a.phone || null,
      email: a.email || null,
      parents_married: a.parents_married === 'yes',
      parents_together: a.parents_together === 'yes',
      responsibility: a.responsibility || null,
      lives_with: a.lives_with || null,
      emergency_name: a.emergency_name || null,
      emergency_phone: a.emergency_phone || null,
      emergency_address: a.emergency_address || null,
      emergency_relationship: a.emergency_relationship || null,
      health_issues: a.health_issues || null,
      disability: a.disability || null,
      consent_discipline: !!a.consent_discipline,
      consent_medical: !!a.consent_medical,
      admission_fee: fee,
      amount_paid: amtPaid,
      payment_method: a.payment_method || null,
      balance_due_date: a.balance_due_date || null,
      payment_status: paymentStatus,
      official_name: actingName,
      confirmed_by: actingName,
      status: 'pending',
    };

    const { data: inserted, error } = await supabase.from('admissions').insert(payload).select('*').single();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

    // Same best-effort admission-confirmation email as submitInternalAdm()
    // (index.html ~L23770) — silently skipped on failure, same as the
    // old app's empty catch.
    if (inserted?.email && inserted?.parent_name) {
      try {
        const { data: schoolSettings } = await supabase.from('school_settings').select('school_name').eq('id', 1).single();
        const schoolName = (schoolSettings as any)?.school_name || 'Victorious International Schools';
        await supabase.from('email_logs').insert({
          to_email: inserted.email,
          to_name: inserted.parent_name,
          subject: `Admission Application — ${inserted.full_name} | ${schoolName}`,
          body_html: `Dear ${inserted.parent_name},<br><br>Your admission application for <strong>${inserted.full_name}</strong> into <strong>${inserted.class_applied}</strong> has been received and is currently being reviewed.<br><br>${schoolName}`,
          status: 'pending',
          created_at: new Date().toISOString(),
        });
      } catch { /* best-effort — same as old app's empty catch around sendEmailDelivery */ }
    }
    return new Response(JSON.stringify({ ok: true, admission: inserted }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Unknown action.' }), { status: 400 });
};
