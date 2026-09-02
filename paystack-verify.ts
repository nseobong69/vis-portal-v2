import type { APIRoute } from 'astro';

export const prerender = false;

// Equivalent of the old app's `paystack-verify` Supabase Edge Function —
// same caveat as paystack-initialize.ts: freshly written here, not ported,
// because the original only ever existed server-side in your Supabase
// project. Verifies a transaction reference directly against Paystack's
// API using the secret key, and reports back whether it actually succeeded
// and for how much — never trust the client's own claim of success.

export const POST: APIRoute = async ({ request }) => {
  const secretKey = import.meta.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    return new Response(
      JSON.stringify({ error: 'Paystack is not configured on this server (missing PAYSTACK_SECRET_KEY).' }),
      { status: 503 },
    );
  }

  let body: { reference?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }
  if (!body.reference) {
    return new Response(JSON.stringify({ error: 'reference is required.' }), { status: 400 });
  }

  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(body.reference)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const json = await res.json();
  if (!res.ok || !json?.status) {
    return new Response(JSON.stringify({ error: json?.message || 'Could not verify transaction.' }), { status: 502 });
  }

  const data = json.data;
  const success = data?.status === 'success';
  return new Response(JSON.stringify({
    success,
    status: data?.status,
    amount_naira: success ? (data.amount || 0) / 100 : 0,
    reference: data?.reference,
    paid_at: data?.paid_at || null,
  }), { status: 200 });
};
