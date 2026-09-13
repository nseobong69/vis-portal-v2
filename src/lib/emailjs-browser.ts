// Ports index.html's sendEmailDelivery()/_ensureEmailJS() (~L20296-20336)
// almost verbatim. EmailJS's SDK is a BROWSER library by design — its
// "public key" only authorizes send calls from a page origin, there is
// no way to call it server-side without their separate REST API, which
// needs a private key nobody has configured (school_settings has no
// emailjs_private_key column). So this stays client-side on purpose,
// exactly like the old app did — it is not a workaround, it's the
// correct way to use this specific service.
//
// Used by both EmailComposeForm.tsx (manual sends) and
// FeeRemindersManager.tsx ("Send Reminders Now") so there is exactly
// one place that knows how to talk to EmailJS, instead of two slightly
// different reimplementations.

export interface EmailJSConfig {
  service_id: string | null;
  template_id: string | null;
  public_key: string | null;
  reply_email: string | null;
  school_name: string | null;
}

declare global {
  interface Window {
    emailjs?: {
      init: (opts: { publicKey: string }) => void;
      send: (serviceId: string, templateId: string, params: Record<string, string>) => Promise<unknown>;
    };
    _emailjsKey?: string;
  }
}

const EMAILJS_CDN_URL = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4.4.1/dist/email.min.js';

let loadPromise: Promise<void> | null = null;

/** Same lazy-load-once pattern as the old app's window._ensureEmailJS(). */
function ensureEmailJSLoaded(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('EmailJS can only be sent from the browser.'));
  if (window.emailjs) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = EMAILJS_CDN_URL;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load EmailJS. Check your internet connection.'));
    document.head.appendChild(script);
  });
  return loadPromise;
}

export interface SendEmailInput {
  toEmail: string;
  toName?: string;
  subject: string;
  bodyHtml?: string;
  message?: string;
}

/**
 * Sends one email via EmailJS. Throws on any failure (missing config,
 * CDN load failure, EmailJS rejecting the send) — callers are
 * responsible for logging the outcome to email_delivery_log via
 * /api/admin/email/log, same separation of concerns the old app had
 * (sendEmailDelivery did both itself; splitting it here lets both
 * EmailComposeForm and FeeRemindersManager reuse the send half only).
 */
export async function sendEmailViaEmailJS(input: SendEmailInput, cfg: EmailJSConfig): Promise<void> {
  const { service_id: serviceId, template_id: templateId, public_key: publicKey } = cfg;
  if (!serviceId || !templateId || !publicKey) {
    throw new Error('EmailJS not configured. Go to School Settings → Email Configuration and add your EmailJS keys.');
  }

  await ensureEmailJSLoaded();
  if (!window.emailjs) throw new Error('EmailJS did not load correctly. Please refresh and try again.');

  if (window._emailjsKey !== publicKey) {
    window.emailjs.init({ publicKey });
    window._emailjsKey = publicKey;
  }

  // Same HTML->plain-text fallback the old app computes when no
  // explicit `message` is given, so templates using {{message}} still
  // render something readable even for HTML-only callers.
  const plainMessage =
    input.message ||
    (input.bodyHtml || input.subject)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<\/td>/gi, ' | ')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

  await window.emailjs.send(serviceId, templateId, {
    to_email: input.toEmail,
    to_name: input.toName || 'Recipient',
    school_name: cfg.school_name || 'the school',
    subject: input.subject,
    body_html: input.bodyHtml || input.subject, // template should use {{{body_html}}} (triple braces) for HTML
    message: plainMessage, // template should use {{message}} for plain-text
    reply_email: cfg.reply_email || 'no-reply@example.com',
  });
}
