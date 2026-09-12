import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';
import { createAdminSupabase } from '../../../../lib/supabaseAdmin';
import { genPassword, genAdmissionNumber, sendLoginDetailsEmail } from '../../../../lib/signupProfiles';

export const prerender = false;

// Mirrors canAccessAccountCreation() (index.html ~L18497) — same role set
// renderSignUpProfiles() itself gates on (~L29530).
const ALLOWED_ROLES = ['super_admin', 'admin', 'proprietor', 'head_teacher', 'principal'];

interface Body {
  action: 'list' | 'approve' | 'reject';
  id?: string;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ALLOWED_ROLES);
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

  // Mirrors UP?.full_name||'Admin' (index.html ~L29636, ~L29651) — a
  // human-readable name for reviewed_by rather than a raw user id.
  // checkAuth() only returns {status, role, userId}, so this looks the
  // name up separately via profiles.auth_id (confirmed real column).
  async function reviewerName(): Promise<string> {
    const { data } = await supabase.from('profiles').select('full_name').eq('auth_id', auth.userId).maybeSingle();
    return data?.full_name || auth.role || 'Admin';
  }

  if (body.action === 'list') {
    const { data: reqs, error } = await supabase
      .from('signup_requests')
      .select('*')
      .order('submitted_at', { ascending: false })
      .limit(100);
    if (error) {
      // Same fallback the old app itself shows when the table doesn't
      // exist yet (index.html ~L29551-29553) — same CREATE TABLE, ported
      // verbatim so this environment's fix is identical to the old one's.
      return new Response(
        JSON.stringify({
          error: error.message,
          missingTableSql:
            "create table if not exists signup_requests (id uuid default gen_random_uuid() primary key, full_name text, gender text, address text, email text, phone text, role text, extra_info text, status text default 'pending', submitted_at timestamptz default now(), reviewed_at timestamptz, reviewed_by text);",
        }),
        { status: 500 }
      );
    }
    const all = reqs || [];
    return new Response(
      JSON.stringify({
        pending: all.filter((r) => r.status === 'pending'),
        approved: all.filter((r) => r.status === 'approved'),
        rejected: all.filter((r) => r.status === 'rejected'),
      }),
      { status: 200 }
    );
  }

  if (body.action === 'reject') {
    if (!body.id) return new Response(JSON.stringify({ error: 'Missing request id.' }), { status: 400 });
    const { error } = await supabase
      .from('signup_requests')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: await reviewerName() })
      .eq('id', body.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  if (body.action === 'approve') {
    if (!body.id) return new Response(JSON.stringify({ error: 'Missing request id.' }), { status: 400 });

    const { data: req, error: reqErr } = await supabase.from('signup_requests').select('*').eq('id', body.id).single();
    if (reqErr || !req) return new Response(JSON.stringify({ error: 'Request not found.' }), { status: 404 });
    if (req.status !== 'pending') {
      return new Response(JSON.stringify({ error: 'This request has already been reviewed.' }), { status: 409 });
    }

    let adminSupabase;
    try {
      adminSupabase = createAdminSupabase();
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }

    const password = genPassword(8);
    const nm = req.full_name || 'User';
    const email = req.email || '';
    let insertedId: string | null = null;
    let authUserId: string | null = null;
    let loginEmail = email;

    try {
      if (req.role === 'staff') {
        const { data: newRec, error } = await supabase
          .from('profiles')
          .insert({
            full_name: nm,
            email,
            role: 'teacher',
            gender: req.gender || null,
            address: req.address || null,
            phone: req.phone || null,
          })
          .select('id')
          .single();
        if (error) return new Response(JSON.stringify({ error: 'Error creating staff: ' + error.message }), { status: 500 });
        insertedId = newRec?.id;
        if (email) {
          const { data: au, error: authErr } = await adminSupabase.auth.admin.createUser({ email, password, email_confirm: true });
          if (!authErr && au?.user) {
            authUserId = au.user.id;
            await supabase.from('profiles').update({ auth_id: authUserId, has_account: true }).eq('id', insertedId);
          }
        }
      } else if (req.role === 'student') {
        const adm = genAdmissionNumber();
        const surnamePart = nm.split(' ')[0] || nm;
        const { data: newRec, error } = await supabase
          .from('students')
          .insert({
            full_name: nm,
            surname: surnamePart,
            admission_number: adm,
            email,
            gender: req.gender || null,
            class_name: req.extra_info || null,
          })
          .select('id')
          .single();
        if (error) return new Response(JSON.stringify({ error: 'Error creating student: ' + error.message }), { status: 500 });
        insertedId = newRec?.id;
        // Students log in with a synthetic school email keyed to their
        // admission number, same as the old app (~L29618-29622).
        loginEmail = `${adm.replace(/[/\\\s]/g, '').toLowerCase()}@student.vis.school`;
        const { data: au, error: authErr } = await adminSupabase.auth.admin.createUser({ email: loginEmail, password, email_confirm: true });
        if (!authErr && au?.user) {
          authUserId = au.user.id;
          await supabase.from('students').update({ auth_id: authUserId, has_account: true }).eq('id', insertedId);
        }
      } else if (req.role === 'parent') {
        const { data: newRec, error } = await supabase
          .from('parents')
          .insert({ full_name: nm, email, phone: req.phone || null, gender: req.gender || null, address: req.address || null })
          .select('id')
          .single();
        if (error) return new Response(JSON.stringify({ error: 'Error creating parent: ' + error.message }), { status: 500 });
        insertedId = newRec?.id;
        if (email) {
          const { data: au, error: authErr } = await adminSupabase.auth.admin.createUser({ email, password, email_confirm: true });
          if (!authErr && au?.user) {
            authUserId = au.user.id;
            await supabase.from('parents').update({ auth_id: authUserId, has_account: true }).eq('id', insertedId);
          }
        }
      } else {
        return new Response(JSON.stringify({ error: `Unknown request role: ${req.role}` }), { status: 400 });
      }
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message || 'Account creation failed.' }), { status: 500 });
    }

    await supabase
      .from('signup_requests')
      .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: await reviewerName() })
      .eq('id', body.id);

    // Best-effort email — failure here is NOT fatal (the account already
    // exists), but unlike the old app's silent catch, we surface both the
    // outcome and the password itself so it's never simply lost.
    let emailSent = false;
    let emailError: string | undefined;
    if (loginEmail && authUserId) {
      const { data: settings } = await supabase.from('school_settings').select('*').limit(1).maybeSingle();
      const result = await sendLoginDetailsEmail(settings || {}, { toEmail: email || loginEmail, toName: nm, email: loginEmail, password, role: req.role });
      emailSent = result.ok;
      emailError = result.error;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        accountCreated: !!authUserId,
        loginEmail,
        password, // returned so the admin can relay it manually if email fails — see comment above
        emailSent,
        emailError,
      }),
      { status: 200 }
    );
  }

  return new Response(JSON.stringify({ error: 'Unknown action.' }), { status: 400 });
};
