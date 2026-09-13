import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

// Backs the Reception / visitor-log admin screen. Ported from
// _checkInVisitor() / _checkOutVisitor() (index.html ~L20893-20916).
// logged_by is resolved server-side from the authenticated user's own
// profile row, rather than trusting whatever the client sends — mirrors
// UP?.full_name in the old app, but looked up from the verified session.

const ALLOWED_ROLES = ['super_admin', 'admin', 'proprietor', 'head_teacher', 'principal'];

function err(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), { status });
}

function ok(payload: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: true, ...payload }), { status: 200 });
}

function genBadgeNumber(): string {
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const rand = Math.floor(100 + Math.random() * 900);
  return `VG-${date}-${rand}`;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ALLOWED_ROLES);
  if (auth.status !== 'authorized') {
    return err('Not authorized.', 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return err('Invalid JSON.');
  }

  const { action } = body as { action?: string };
  const supabase = createServerSupabase(cookies);

  switch (action) {
    case 'checkIn': {
      const {
        full_name, phone, id_type, id_number,
        purpose, host_name, visiting_student,
      } = body as Record<string, unknown>;

      if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
        return err('Visitor name is required.');
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', auth.userId)
        .single();

      const { data, error } = await supabase
        .from('visitors')
        .insert({
          full_name: full_name.trim(),
          phone: phone || null,
          id_type: id_type || null,
          id_number: id_number || null,
          purpose: purpose || null,
          host_name: host_name || null,
          visiting_student: visiting_student || null,
          badge_number: genBadgeNumber(),
          status: 'checked_in',
          check_in_time: new Date().toISOString(),
          logged_by: profile?.full_name || null,
        })
        .select('*')
        .single();
      if (error) return err(error.message, 500);
      return ok({ visitor: data });
    }

    case 'checkOut': {
      const { id } = body as { id?: string };
      if (!id) return err('Missing id.');
      const { error } = await supabase
        .from('visitors')
        .update({ status: 'checked_out', check_out_time: new Date().toISOString() })
        .eq('id', id);
      if (error) return err(error.message, 500);
      return ok({});
    }

    default:
      return err(`Unknown action "${action}".`);
  }
};
