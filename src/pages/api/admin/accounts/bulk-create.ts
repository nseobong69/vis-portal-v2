import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase, createAdminSupabase } from '../../../../lib/supabase';

export const prerender = false;

// Ported from saveStudentAccountCreds()/saveStaffAccountCreds()
// (index.html ~L18645-18675, ~18760-18790). Same synthetic-email
// convention for students as Student Auth Migration
// (admission_number@student.vis.school), same "already exists ->
// update password instead" fallback, same auth_id write-back. Uses the
// real Supabase service-role client (createAdminSupabase, same one
// Student Auth Migration and this route's older single-account sibling
// at api/admin/accounts/create.ts already rely on) rather than an
// Edge Function, since this Astro server route IS the trusted backend.
interface StudentRow { id: string; adm: string; pass: string }
interface StaffRow { id: string; email: string; pass: string }
interface Body {
  type: 'students' | 'staff';
  students?: StudentRow[];
  staff?: StaffRow[];
}

export const POST: APIRoute = async ({ request, cookies }) => {
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

  let admin;
  try {
    admin = createAdminSupabase();
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Admin client unavailable.' }), { status: 500 });
  }
  const supabase = createServerSupabase(cookies);

  if (body.type === 'students') {
    const rows = (body.students || []).filter((r) => r.adm?.trim() && r.pass?.trim());
    if (!rows.length) return new Response(JSON.stringify({ error: 'No credentials to save.' }), { status: 400 });
    const admNums = rows.map((r) => r.adm.trim());
    if (new Set(admNums).size !== admNums.length) {
      return new Response(JSON.stringify({ error: 'Duplicate admission numbers detected. Each must be unique.' }), { status: 400 });
    }

    let saved = 0, failed = 0;
    const log: string[] = [];
    for (const r of rows) {
      try {
        const { data: st, error: dbErr } = await supabase
          .from('students').update({ admission_number: r.adm.trim(), has_account: true })
          .eq('id', r.id).select('full_name, email, admission_number').single();
        if (dbErr) { failed++; log.push(`${r.id}: ${dbErr.message}`); continue; }

        const safeAdm = r.adm.trim().replace(/[/\\\s]/g, '').toLowerCase();
        const syntheticEmail = `${safeAdm}@student.vis.school`;
        let authId: string | null = null;
        const { data: au, error: authErr } = await admin.auth.admin.createUser({
          email: syntheticEmail, password: r.pass.trim(), email_confirm: true,
        });
        if (authErr) {
          if (authErr.message?.toLowerCase().includes('already')) {
            const { data: list } = await admin.auth.admin.listUsers();
            const existing = list?.users?.find((u) => u.email === syntheticEmail);
            if (existing) {
              await admin.auth.admin.updateUserById(existing.id, { password: r.pass.trim() });
              authId = existing.id;
            }
          }
        } else {
          authId = au?.user?.id || null;
        }
        if (authId) await supabase.from('students').update({ auth_id: authId }).eq('id', r.id);
        saved++;
      } catch (e) {
        failed++;
        log.push(`${r.id}: ${e instanceof Error ? e.message : 'unknown error'}`);
      }
    }
    return new Response(JSON.stringify({ ok: true, saved, failed, log }), { status: 200 });
  }

  if (body.type === 'staff') {
    if (!['super_admin', 'admin'].includes(auth.role)) {
      return new Response(JSON.stringify({ error: 'Only Super Admin and Admin can create staff accounts.' }), { status: 403 });
    }
    const rows = (body.staff || []).filter((r) => r.email?.trim() && r.pass?.trim());
    if (!rows.length) return new Response(JSON.stringify({ error: 'No credentials to save.' }), { status: 400 });

    let saved = 0, failed = 0;
    const log: string[] = [];
    for (const r of rows) {
      try {
        const email = r.email.trim().toLowerCase();
        const { data: sp, error: dbErr } = await supabase
          .from('profiles').update({ email, has_account: true })
          .eq('id', r.id).select('full_name, email').single();
        if (dbErr) { failed++; log.push(`${r.id}: ${dbErr.message}`); continue; }

        let authId: string | null = null;
        const { data: au, error: authErr } = await admin.auth.admin.createUser({
          email, password: r.pass.trim(), email_confirm: true,
        });
        if (authErr) {
          if (authErr.message?.toLowerCase().includes('already')) {
            const { data: list } = await admin.auth.admin.listUsers();
            const existing = list?.users?.find((u) => u.email === email);
            if (existing) {
              await admin.auth.admin.updateUserById(existing.id, { password: r.pass.trim() });
              authId = existing.id;
            }
          }
        } else {
          authId = au?.user?.id || null;
        }
        if (authId) await supabase.from('profiles').update({ auth_id: authId }).eq('id', r.id);
        saved++;
      } catch (e) {
        failed++;
        log.push(`${r.id}: ${e instanceof Error ? e.message : 'unknown error'}`);
      }
    }
    return new Response(JSON.stringify({ ok: true, saved, failed, log }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Unknown type.' }), { status: 400 });
};
