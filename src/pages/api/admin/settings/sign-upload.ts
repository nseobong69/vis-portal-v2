import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { checkAuth } from '../../../../lib/auth';

export const prerender = false;

// Same signed-upload pattern as src/pages/api/student/exams/sign-photo-upload.ts,
// which itself ports the old app's uploadToCloudinary()/sign-cloudinary-upload
// Edge Function (index.html ~line 16225): the API secret never leaves the
// server, the client only ever receives a signature + timestamp and uploads
// straight to Cloudinary. This endpoint is the school-settings-specific
// version — School Identity (logo/hero) and "What Sets Us Apart" card images.
//
// Old app's folder conventions this mirrors (index.html):
//   'vis/school'              — logo, hero image, stamps, signatures
//   'vis/homepage/apart'      — "What Sets Us Apart" card images
//   'vis/homepage/leadership' — leadership card photos (not built yet here)
const ALLOWED_FOLDER_PREFIXES = ['vis/school', 'vis/homepage/'];

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ['super_admin']);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  let body: { folder?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }

  const folder = body.folder;
  if (!folder || !ALLOWED_FOLDER_PREFIXES.some((p) => folder.startsWith(p))) {
    return new Response(JSON.stringify({ error: 'Invalid or disallowed folder.' }), { status: 400 });
  }

  const cloudName = import.meta.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = import.meta.env.CLOUDINARY_API_KEY;
  const apiSecret = import.meta.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    return new Response(JSON.stringify({ error: 'Cloudinary is not configured on the server.' }), { status: 500 });
  }

  const public_id = Math.random().toString(36).slice(2, 10);
  const timestamp = Math.floor(Date.now() / 1000);

  // Cloudinary's signature: SHA1 of the sorted param string + api_secret.
  const toSign = `folder=${folder}&public_id=${public_id}&timestamp=${timestamp}${apiSecret}`;
  const signature = createHash('sha1').update(toSign).digest('hex');

  return new Response(
    JSON.stringify({ cloud_name: cloudName, api_key: apiKey, folder, public_id, timestamp, signature }),
    { status: 200 }
  );
};
