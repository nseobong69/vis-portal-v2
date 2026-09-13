import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createHash } from 'crypto';

export const prerender = false;

const ALLOWED = ['super_admin', 'admin', 'proprietor', 'head_teacher', 'principal'];

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ALLOWED);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  const cloudName = import.meta.env.CLOUDINARY_CLOUD_NAME ?? '';
  const apiKey    = import.meta.env.CLOUDINARY_API_KEY ?? '';
  const apiSecret = import.meta.env.CLOUDINARY_API_SECRET ?? '';

  if (!cloudName || !apiKey || !apiSecret) {
    return new Response(
      JSON.stringify({ error: 'Cloudinary not configured. Check CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in Render environment.' }),
      { status: 500 }
    );
  }

  let formData: FormData;
  try { formData = await request.formData(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid form data.' }), { status: 400 });
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return new Response(JSON.stringify({ error: 'No file provided.' }), { status: 400 });
  }

  // Build a signed upload request — required when using API Key + Secret
  // (no upload preset). Mirrors the old app's uploadToCloudinary() intent.
  const folder    = 'vis/public_posts';
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // Signature: SHA-1 of "folder=...&timestamp=...{apiSecret}"
  const sigStr = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
  const signature = createHash('sha1').update(sigStr).digest('hex');

  const cldForm = new FormData();
  cldForm.append('file', file);
  cldForm.append('folder', folder);
  cldForm.append('timestamp', timestamp);
  cldForm.append('api_key', apiKey);
  cldForm.append('signature', signature);

  const cldRes = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: 'POST', body: cldForm }
  );
  const cldData = await cldRes.json();

  if (!cldRes.ok) {
    return new Response(
      JSON.stringify({ error: cldData?.error?.message || 'Cloudinary upload failed.' }),
      { status: 500 }
    );
  }

  return new Response(
    JSON.stringify({ ok: true, url: cldData.secure_url }),
    { status: 200 }
  );
};

