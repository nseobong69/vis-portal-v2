import type { APIRoute } from 'astro';
import { checkAuth } from '../../../lib/auth';
import { createServerSupabase } from '../../../lib/supabase';

export const prerender = false;

// Whitelisted simple tables that AdminCrudList is allowed to read/write.
// Add a table name here when a new calendar.astro-style page needs it.
// Each entry lists the columns that may be inserted (never let the client
// write arbitrary columns to arbitrary tables).
const TABLE_FIELDS: Record<string, string[]> = {
  school_day_status: ['date', 'status'],
  aptitude_codes: ['code'],
};

const ALLOWED_ROLES = ['super_admin', 'admin', 'proprietor', 'head_teacher', 'principal'];

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ALLOWED_ROLES);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  let body: { table: string; fields: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON.' }), { status: 400 });
  }

  const { table, fields } = body;
  const allowed = TABLE_FIELDS[table];
  if (!allowed) {
    return new Response(JSON.stringify({ error: `Table "${table}" is not available here.` }), { status: 400 });
  }

  // Only write whitelisted columns — strip anything else the client sent
  const safe: Record<string, unknown> = {};
  for (const col of allowed) {
    if (fields[col] !== undefined) safe[col] = fields[col];
  }

  const supabase = createServerSupabase(cookies);
  const { data, error } = await supabase.from(table).insert(safe).select('*').single();
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true, row: data }), { status: 200 });
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ALLOWED_ROLES);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  let body: { table: string; id: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON.' }), { status: 400 });
  }

  const { table, id } = body;
  if (!TABLE_FIELDS[table]) {
    return new Response(JSON.stringify({ error: `Table "${table}" is not available here.` }), { status: 400 });
  }
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing id.' }), { status: 400 });
  }

  const supabase = createServerSupabase(cookies);
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
