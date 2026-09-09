import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

interface StaffFields {
  full_name: string;
  phone?: string;
  email?: string;
  roles: string[];
  staff_code?: string;
  basic_salary?: number;
  allowance_housing?: number;
  allowance_transport?: number;
  allowance_other?: number;
  deduction_tax?: number;
  deduction_pension?: number;
  deduction_other?: number;
  staff_bank_name?: string;
  staff_bank_account_number?: string;
  staff_bank_account_name?: string;
}

interface Body {
  action: 'create' | 'update' | 'delete';
  id?: string;
  fields?: StaffFields;
}

const NUM_FIELDS = [
  'basic_salary', 'allowance_housing', 'allowance_transport', 'allowance_other',
  'deduction_tax', 'deduction_pension', 'deduction_other',
] as const;

const CAN_WRITE = ['super_admin', 'admin', 'proprietor', 'head_teacher', 'principal'];

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, CAN_WRITE);
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

  if (body.action === 'create') {
    const f = body.fields;
    if (!f?.full_name?.trim()) return new Response(JSON.stringify({ error: 'Full name is required.' }), { status: 400 });
    if (!f.roles?.length) return new Response(JSON.stringify({ error: 'Select at least one role.' }), { status: 400 });

    // Same payload shape as addStaff() (index.html ~8598) — role kept in
    // sync with roles[0] as the "primary role" convention the old app uses.
    // NOTE: the old app also auto-creates a Supabase Auth account + emails
    // a temp password here via an edge function (_callAuthAdmin). That
    // requires a service-role secret this endpoint doesn't have — same
    // scope line the old app's own UI draws ("Assign login via Account
    // Creation after saving"). Profile row only, for now.
    const { error, data } = await supabase.from('profiles').insert({
      full_name: f.full_name.trim(),
      phone: (f.phone || '').trim() || null,
      email: (f.email || '').trim().toLowerCase() || null,
      role: f.roles[0],
      roles: f.roles,
      has_account: false,
      profile_completed: false,
    }).select('id').single();

    if (error) {
      if (error.message?.includes('role_check') || error.message?.includes('check constraint')) {
        return new Response(JSON.stringify({ error: 'Database role constraint error — check the roles column constraint in Supabase.' }), { status: 500 });
      }
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
    return new Response(JSON.stringify({ ok: true, id: data.id }), { status: 200 });
  }

  if (body.action === 'update') {
    if (!body.id) return new Response(JSON.stringify({ error: 'Missing staff id.' }), { status: 400 });
    const f = body.fields;
    if (!f?.roles?.length) return new Response(JSON.stringify({ error: 'Select at least one role.' }), { status: 400 });

    // Same field list as saveStaff() (index.html ~8670).
    const update: Record<string, unknown> = {
      full_name: f.full_name?.trim(),
      staff_code: f.staff_code || null,
      phone: f.phone || null,
      role: f.roles[0],
      roles: f.roles,
      staff_bank_name: f.staff_bank_name || null,
      staff_bank_account_number: f.staff_bank_account_number || null,
      staff_bank_account_name: f.staff_bank_account_name || null,
    };
    for (const key of NUM_FIELDS) {
      const n = Number(f[key]);
      update[key] = Number.isFinite(n) ? n : 0;
    }

    const { data: oldRec } = await supabase.from('profiles').select('staff_code, auth_id').eq('id', body.id).single();
    const { error } = await supabase.from('profiles').update(update).eq('id', body.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

    // Old app syncs a changed staff_code to the Auth password via an edge
    // function when the staff has an auth_id — same service-role gap noted
    // above, so that sync step isn't replicated here; flag it instead.
    const codeChanged = f.staff_code && f.staff_code !== oldRec?.staff_code && oldRec?.auth_id;
    return new Response(JSON.stringify({ ok: true, authPasswordSyncSkipped: !!codeChanged }), { status: 200 });
  }

  if (body.action === 'delete') {
    // Delete stays super_admin-only, per removeStaff()'s ROLE check
    // (index.html ~8730: "Only Super Admin can delete staff accounts.").
    if (auth.role !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'Only Super Admin can delete staff.' }), { status: 401 });
    }
    if (!body.id) return new Response(JSON.stringify({ error: 'Missing staff id.' }), { status: 400 });
    // Same cleanup scope as confirmDeleteStaff() (index.html ~8730):
    // strip class/subject assignments before removing the profile.
    await supabase.from('teacher_classes').delete().eq('teacher_id', body.id);
    await supabase.from('teacher_subjects').delete().eq('teacher_id', body.id);
    const { error } = await supabase.from('profiles').delete().eq('id', body.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Unknown action.' }), { status: 400 });
};
