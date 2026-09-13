import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';
import { createAdminSupabase } from '../../../../lib/supabaseAdmin';
import { genPassword, genAdmissionNumber } from '../../../../lib/signupProfiles';

export const prerender = false;

// Mirrors renderACExisting()'s own gate for the staff tab specifically
// (index.html ~L18796: "Only Super Admin and Admin can view existing
// staff accounts") — the student tab has no extra restriction beyond
// the page-level Account Creation access already checked in the .astro.
const STAFF_VIEW_ROLES = ['super_admin', 'admin'];

interface Body {
  action: 'list' | 'editCred' | 'regenCred';
  type: 'staff' | 'student';
  id?: string;
  cred1?: string; // email (staff) or admission number (student)
  cred2?: string; // new password, optional on edit
}

function studentSyntheticEmail(admissionNumber: string): string {
  return admissionNumber.toUpperCase().replace(/[^A-Z0-9]/g, '').toLowerCase() + '@student.vis.school';
}

export const POST: APIRoute = async ({ request, cookies }) => {
  // Same allow-list as the Account Creation page itself — the staff-only
  // restriction for the staff tab is enforced separately below.
  const auth = await checkAuth(cookies, ['super_admin', 'admin', 'proprietor', 'head_teacher', 'principal']);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }

  if (body.type === 'staff' && !STAFF_VIEW_ROLES.includes(auth.role)) {
    return new Response(JSON.stringify({ error: 'Only Super Admin and Admin can view existing staff accounts.' }), { status: 403 });
  }

  const supabase = createServerSupabase(cookies);
  const table = body.type === 'staff' ? 'profiles' : 'students';

  if (body.action === 'list') {
    const { data, error } = await supabase.from(table).select('*').eq('has_account', true).order('full_name');
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ records: data || [] }), { status: 200 });
  }

  let adminSupabase;
  try {
    adminSupabase = createAdminSupabase();
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }

  if (body.action === 'editCred') {
    if (!body.id) return new Response(JSON.stringify({ error: 'Missing record id.' }), { status: 400 });
    const cred1 = (body.cred1 || '').trim();
    if (!cred1) return new Response(JSON.stringify({ error: 'First field is required.' }), { status: 400 });
    // Only student passwords get uppercased — matches the old app's
    // own rule (studentLogin() uppercases, staffLogin() doesn't;
    // index.html ~L6015/6021 vs ~L6052/6062). Staff choose real
    // passwords of their own; students get a surname-derived one.
    const cred2 = (body.cred2 || '').trim();
    const normalizedCred2 = body.type === 'student' ? cred2.toUpperCase() : cred2;

    // Only update identifiers in DB — passwords never get written to
    // DB columns, same rule the old app enforces.
    const upd: Record<string, any> = body.type === 'staff' ? { email: cred1.toLowerCase() } : { admission_number: cred1.toUpperCase() };
    const { data: rec, error } = await supabase.from(table).update(upd).eq('id', body.id).select('auth_id').single();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

    try {
      if (rec?.auth_id) {
        const authUpd: Record<string, any> = {};
        if (body.type === 'staff') authUpd.email = cred1.toLowerCase();
        if (body.type === 'student') authUpd.email = studentSyntheticEmail(cred1);
        if (cred2) authUpd.password = normalizedCred2;
        if (Object.keys(authUpd).length) {
          await adminSupabase.auth.admin.updateUserById(rec.auth_id, authUpd);
        }
      } else if (cred2) {
        const authEmail = body.type === 'staff' ? cred1.toLowerCase() : studentSyntheticEmail(cred1);
        const { data: nu } = await adminSupabase.auth.admin.createUser({ email: authEmail, password: normalizedCred2, email_confirm: true });
        if (nu?.user) await supabase.from(table).update({ auth_id: nu.user.id, has_account: true }).eq('id', body.id);
      }
    } catch (e: any) {
      return new Response(JSON.stringify({ ok: true, authWarning: 'DB updated but Auth sync failed: ' + (e.message || 'unknown error') }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  if (body.action === 'regenCred') {
    if (!body.id) return new Response(JSON.stringify({ error: 'Missing record id.' }), { status: 400 });
    // Same type-conditional rule as editCred above — only student
    // passwords get uppercased before touching Auth.
    const rawPass = genPassword(8);
    const newPass = body.type === 'student' ? rawPass.toUpperCase() : rawPass;
    const upd: Record<string, any> = {};
    if (body.type === 'student') upd.admission_number = genAdmissionNumber();

    let rec: { auth_id: string | null } | null = null;
    if (Object.keys(upd).length) {
      const { data, error } = await supabase.from(table).update(upd).eq('id', body.id).select('auth_id').single();
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
      rec = data;
    } else {
      const { data } = await supabase.from(table).select('auth_id').eq('id', body.id).single();
      rec = data;
    }

    try {
      if (rec?.auth_id) {
        const authUpd: Record<string, any> = { password: newPass };
        if (body.type === 'student' && upd.admission_number) authUpd.email = studentSyntheticEmail(upd.admission_number);
        await adminSupabase.auth.admin.updateUserById(rec.auth_id, authUpd);
      } else {
        let authEmail = '';
        if (body.type === 'staff') {
          const { data: p } = await supabase.from('profiles').select('email').eq('id', body.id).single();
          authEmail = p?.email || '';
        } else if (upd.admission_number) {
          authEmail = studentSyntheticEmail(upd.admission_number);
        }
        if (!authEmail) return new Response(JSON.stringify({ error: 'No email available to create an Auth account.' }), { status: 400 });
        const { data: nu } = await adminSupabase.auth.admin.createUser({ email: authEmail, password: newPass, email_confirm: true });
        if (nu?.user) await supabase.from(table).update({ auth_id: nu.user.id, has_account: true }).eq('id', body.id);
      }
    } catch (e: any) {
      return new Response(JSON.stringify({ error: 'Error syncing Auth: ' + (e.message || 'unknown error') }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true, newPassword: newPass, newAdmissionNumber: upd.admission_number || null }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Unknown action.' }), { status: 400 });
};
