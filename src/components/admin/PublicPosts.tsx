import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

const ALLOWED = ['super_admin', 'admin', 'proprietor', 'head_teacher', 'principal'];

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ALLOWED);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }
  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON.' }), { status: 400 });
  }

  const supabase = createServerSupabase(cookies);
  const { action } = body;

  if (action === 'create') {
    const { title, content, image_url, image_urls, is_published, author_name, author_role } = body;
    if (!content?.trim()) return new Response(JSON.stringify({ error: 'Content is required.' }), { status: 400 });
    const { data, error } = await supabase.from('public_posts').insert({
      title: title || null, content: content.trim(),
      image_url: image_url || null, image_urls: image_urls || null,
      is_published: !!is_published,
      author_name: author_name || 'Admin', author_role: author_role || 'admin',
      created_by: auth.userId,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).select('*').single();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true, post: data }), { status: 200 });
  }

  if (action === 'update') {
    const { id, title, content, image_url, image_urls, is_published } = body;
    if (!id) return new Response(JSON.stringify({ error: 'Missing id.' }), { status: 400 });
    if (!content?.trim()) return new Response(JSON.stringify({ error: 'Content is required.' }), { status: 400 });
    const { data, error } = await supabase.from('public_posts').update({
      title: title || null, content: content.trim(),
      image_url: image_url || null, image_urls: image_urls || null,
      is_published: !!is_published, updated_at: new Date().toISOString(),
    }).eq('id', id).select('*').single();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true, post: data }), { status: 200 });
  }

  if (action === 'togglePublish') {
    const { id, is_published } = body;
    if (!id) return new Response(JSON.stringify({ error: 'Missing id.' }), { status: 400 });
    const { error } = await supabase.from('public_posts').update({
      is_published: !!is_published, updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  if (action === 'delete') {
    const { id } = body;
    if (!id) return new Response(JSON.stringify({ error: 'Missing id.' }), { status: 400 });
    const { error } = await supabase.from('public_posts').delete().eq('id', id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Unknown action.' }), { status: 400 });
};
