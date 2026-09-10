import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

const FINANCE_ROLES = ['super_admin', 'admin', 'proprietor', 'bursar'];

interface Body {
  action: 'create' | 'delete';
  id?: string;
  feeName?: string;
  amount?: number;
  amountNew?: number | null;
  amountReturning?: number | null;
  session?: string;
  term?: string;
  scope?: 'all' | 'class';
  classIds?: string[];
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

  if (body.action === 'create') {
    const feeName = (body.feeName || '').trim();
    const amount = Number(body.amount);
    if (!feeName) return new Response(JSON.stringify({ error: 'Fee name is required.' }), { status: 400 });
    if (!body.term) return new Response(JSON.stringify({ error: 'Select a term.' }), { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0) {
      return new Response(JSON.stringify({ error: 'Enter a valid amount.' }), { status: 400 });
    }
    const scope = body.scope === 'class' ? 'class' : 'all';
    if (scope === 'class' && !body.classIds?.length) {
      return new Response(JSON.stringify({ error: 'Select at least one class, or choose "All classes".' }), { status: 400 });
    }
    const record = {
      fee_name: feeName,
      amount,
      amount_new: body.amountNew ?? null,
      amount_returning: body.amountReturning ?? null,
      session: body.session || null,
      term: body.term,
      scope,
      class_ids: scope === 'class' ? body.classIds : null,
      created_by: auth.userId,
    };
    const { data, error } = await supabase.from('fee_configs').insert(record).select().single();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true, config: data }), { status: 200 });
  }

  if (body.action === 'delete') {
    if (!body.id) return new Response(JSON.stringify({ error: 'Missing fee config id.' }), { status: 400 });
    const { error } = await supabase.from('fee_configs').delete().eq('id', body.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Unknown action.' }), { status: 400 });
};
