import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

// Ports the relevant slice of the old app's saveSchoolSettings()
// (index.html ~line 17693) for exactly two of its SS_SECTIONS
// (~line 17580): 'school_identity' and 'apart_cards'. Same table,
// same single-row convention (school_settings.id = 1), same
// section→fields mapping — not a redesigned schema.
const IDENTITY_FIELDS = [
  'school_name', 'motto', 'address', 'phone1', 'phone2', 'email',
  'logo_url', 'hero_image_url',
] as const;

// SS_SECTIONS 'academic_calendar' (index.html ~line 17583).
const CALENDAR_FIELDS = [
  'current_session', 'current_term', 'term_end_date', 'next_term_date',
] as const;

// SS_SECTIONS 'brand_colours'.
const COLOUR_FIELDS = ['primary_color', 'secondary_color'] as const;

// The school_settings-level slice of SS_SECTIONS 'signatures_stamps' —
// the Admission Documents + Finance & Fees tabs only. The Classes
// Section tab in the old app is NOT school_settings at all: it reads
// and writes a separate `class_signatures` table keyed by class_id
// (index.html ~line 18341-18411, saveClassSignature()) — a distinct
// per-class CRUD sub-system, intentionally left for its own future
// phase rather than guessed at here.
const SIGNATORY_FIELDS = [
  'admission_signatory_name', 'admission_signatory_role',
  'admission_signatory_signature', 'admission_signatory_stamp',
  'finance_signatory_name', 'finance_signatory_role',
  'finance_signatory_signature', 'finance_signatory_stamp',
] as const;

interface ApartCard {
  icon: string;
  title: string;
  body: string;
  cta: string;
  img: string;
  bg: string;
}

interface LeadershipCard {
  photo: string;
  name: string;
  position: string;
  bio: string;
}

interface SavePayload {
  identity?: Partial<Record<(typeof IDENTITY_FIELDS)[number], string>>;
  calendar?: Partial<Record<(typeof CALENDAR_FIELDS)[number], string>>;
  colours?: Partial<Record<(typeof COLOUR_FIELDS)[number], string>>;
  signatories?: Partial<Record<(typeof SIGNATORY_FIELDS)[number], string>>;
  apart_cards?: ApartCard[];
  leadership_cards?: LeadershipCard[];
  leadership_heading?: string;
  leadership_subtitle?: string;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  // Old app gates this whole screen "School Settings (super_admin only)" —
  // same restriction here, not loosened.
  const auth = await checkAuth(cookies, ['super_admin']);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  let body: SavePayload;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (body.identity) {
    for (const field of IDENTITY_FIELDS) {
      const val = body.identity[field];
      if (val !== undefined) update[field] = (val ?? '').toString().trim() || null;
    }
  }

  if (body.calendar) {
    for (const field of CALENDAR_FIELDS) {
      const val = body.calendar[field];
      if (val !== undefined) update[field] = (val ?? '').toString().trim() || null;
    }
  }

  if (body.colours) {
    for (const field of COLOUR_FIELDS) {
      const val = body.colours[field];
      if (val !== undefined) update[field] = (val ?? '').toString().trim() || null;
    }
  }

  if (body.signatories) {
    for (const field of SIGNATORY_FIELDS) {
      const val = body.signatories[field];
      if (val !== undefined) update[field] = (val ?? '').toString().trim() || null;
    }
  }

  if (body.leadership_heading !== undefined) {
    update.hp_leadership_heading = body.leadership_heading.trim() || null;
  }
  if (body.leadership_subtitle !== undefined) {
    update.hp_leadership_subtitle = body.leadership_subtitle.trim() || null;
  }
  if (body.leadership_cards) {
    if (!Array.isArray(body.leadership_cards)) {
      return new Response(JSON.stringify({ error: 'leadership_cards must be an array.' }), { status: 400 });
    }
    update.hp_leadership_cards = JSON.stringify(
      body.leadership_cards.map((c) => ({
        photo: (c.photo || '').trim(),
        name: (c.name || '').trim(),
        position: (c.position || '').trim(),
        bio: (c.bio || '').trim(),
      }))
    );
  }

  if (body.apart_cards) {
    if (!Array.isArray(body.apart_cards)) {
      return new Response(JSON.stringify({ error: 'apart_cards must be an array.' }), { status: 400 });
    }
    // Same JSON.stringify(ssApartCollect()) shape the old app saves —
    // hp_apart_cards is stored as a JSON string, parsed back out on read.
    update.hp_apart_cards = JSON.stringify(
      body.apart_cards.map((c) => ({
        icon: (c.icon || '').trim(),
        title: (c.title || '').trim(),
        body: (c.body || '').trim(),
        cta: (c.cta || '').trim(),
        img: (c.img || '').trim(),
        bg: c.bg || 'c1',
      }))
    );
  }

  if (Object.keys(update).length === 0) {
    return new Response(JSON.stringify({ error: 'Nothing to save.' }), { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const supabase = createServerSupabase(cookies);
  const { error } = await supabase.from('school_settings').update(update).eq('id', 1);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
