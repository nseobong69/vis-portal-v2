import { randomBytes } from 'node:crypto';

// ═══════════════════════════════════════════════════════════════════════════
// SIGN UP PROFILES — shared helpers. Ported from index.html's genPass()/
// genAdm() (~L6732, ~L29664) and sendLoginDetailsEmail(), used by
// approveSignUpRequest() (~L29590-29646).
// ═══════════════════════════════════════════════════════════════════════════

const PASS_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const ADM_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function secureRandStr(len: number, alphabet: string): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/** Mirrors genPass() — old app's comment: "never use Math.random" for
 *  this, hence node:crypto's randomBytes rather than Math.random here too. */
export function genPassword(len = 8): string {
  return secureRandStr(len, PASS_CHARS);
}

/** Mirrors genAdm()/genAdmNum() — VIS/<year>/<5 random chars>. */
export function genAdmissionNumber(): string {
  return `VIS/${new Date().getFullYear()}/${secureRandStr(5, ADM_CHARS)}`;
}

export interface SchoolSettingsEmailCfg {
  emailjs_service_id?: string | null;
  emailjs_template_id?: string | null;
  emailjs_public_key?: string | null;
  reply_email?: string | null;
  school_name?: string | null;
}

/**
 * Mirrors sendLoginDetailsEmail() via the EmailJS REST API. CAVEAT: EmailJS
 * is primarily designed for browser calls; server-side calls with only the
 * public key can be rejected unless "Allow API calls from non-browser
 * applications" is enabled in your EmailJS account (Account → Security).
 * If that's off, this will fail — non-fatally, see the caller — and the
 * generated password is still returned in the API response so it isn't
 * lost, which the old app's own silent-catch on email failure did not do.
 */
export async function sendLoginDetailsEmail(
  cfg: SchoolSettingsEmailCfg,
  args: { toEmail: string; toName: string; email: string; password: string; role: string }
): Promise<{ ok: boolean; error?: string }> {
  if (!cfg.emailjs_service_id || !cfg.emailjs_template_id || !cfg.emailjs_public_key) {
    return { ok: false, error: 'EmailJS is not configured in School Settings.' };
  }
  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: cfg.emailjs_service_id,
        template_id: cfg.emailjs_template_id,
        user_id: cfg.emailjs_public_key,
        template_params: {
          to_email: args.toEmail,
          to_name: args.toName,
          login_email: args.email,
          login_password: args.password,
          role: args.role,
          school_name: cfg.school_name || 'Victorious International Schools',
          reply_to: cfg.reply_email || '',
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `EmailJS responded ${res.status}: ${text || 'no detail'}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Email send failed.' };
  }
}
