import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

// Ports the school_settings-level slice of the old app's
// saveSchoolSettings() (index.html ~line 17693) and its SS_SECTIONS map
// (~line 17580). Every plain scalar field below is whitelisted by exact
// column name against that source — nothing here is a guessed schema.
//
// Sections intentionally NOT covered by this endpoint, because they are
// not simple school_settings columns:
//  - 'signatures_stamps' Classes tab -> separate `class_signatures` table
//  - 'admissions_fees' per-class fee override -> separate per-class UI
//    (loadAdmFeeClassList()), not a single JSON column
const SCALAR_FIELD_WHITELIST = new Set([
  // School Identity
  'school_name', 'motto', 'address', 'phone1', 'phone2', 'email', 'logo_url', 'hero_image_url',
  // Academic Calendar
  'current_session', 'current_term', 'term_end_date', 'next_term_date',
  // Brand Colours
  'primary_color', 'secondary_color',
  // Signatures & Stamps (school_settings-level only)
  'admission_signatory_name', 'admission_signatory_role', 'admission_signatory_signature', 'admission_signatory_stamp',
  'finance_signatory_name', 'finance_signatory_role', 'finance_signatory_signature', 'finance_signatory_stamp',
  // Payment Gateways & Bank Info
  'paystack_public_key', 'remita_public_key', 'bank_name', 'bank_account_name', 'bank_account_number', 'payment_phone',
  // Email Configuration
  'emailjs_service_id', 'emailjs_template_id', 'emailjs_public_key', 'reply_email',
  // Admissions & Fees Setup (core fields only — see note above)
  'admission_fee_default', 'invigilator_pin', 'apk_url',
  // Admission Info Card (scalars — steps/docs handled separately below)
  'adm_card_image_url', 'adm_card_badge', 'adm_card_badge_show', 'adm_card_intro',
  // School News Section Header
  'hp_news_heading', 'hp_news_subtext',
  // Public Homepage Controls
  'public_tagline', 'public_contact_visible', 'public_admission_btn', 'public_cbt_btn', 'public_feed_visible',
  // Social Media Links
  'social_facebook', 'social_instagram', 'social_youtube', 'social_linkedin', 'social_twitter',
  // "What Sets Us Apart" / "Meet Our Leadership" scalar companions
  'hp_leadership_heading', 'hp_leadership_subtitle',
  // Homepage Hero Section Text
  'hp_hero_tag', 'hp_hero_headline', 'hp_hero_sub', 'hp_hero_cta_primary', 'hp_hero_cta_secondary',
  // School Values Story Cards — text
  'hp_story_1_eyebrow', 'hp_story_1_heading', 'hp_story_1_body', 'hp_story_1_cta1', 'hp_story_1_cta2',
  'hp_story_2_heading', 'hp_story_2_body',
  'hp_story_3_heading', 'hp_story_3_body',
  'hp_story_4_heading', 'hp_story_4_body',
  // School Values Story Cards — photos (cards 2-4; card 1 uses CSS art, no photo)
  'hp_story_wisdom', 'hp_story_courage', 'hp_story_compassion',
  // Academics Page
  'acad_page_nav_title', 'acad_page_heading', 'acad_page_intro',
  'acad_level_1_icon', 'acad_level_1_title', 'acad_level_1_body',
  'acad_level_2_icon', 'acad_level_2_title', 'acad_level_2_body',
  'acad_level_3_icon', 'acad_level_3_title', 'acad_level_3_body',
  'acad_level_4_icon', 'acad_level_4_title', 'acad_level_4_body',
  'acad_strengths_title', 'acad_strength_1', 'acad_strength_2', 'acad_strength_3', 'acad_strength_4', 'acad_strength_5',
  // About Us Page
  'about_intro',
  'about_val_1_icon', 'about_val_1_title', 'about_val_1_body',
  'about_val_2_icon', 'about_val_2_title', 'about_val_2_body',
  'about_val_3_icon', 'about_val_3_title', 'about_val_3_body',
  'about_val_4_icon', 'about_val_4_title', 'about_val_4_body',
]);

const BOOLEAN_FIELDS = new Set([
  'adm_card_badge_show', 'public_contact_visible', 'public_admission_btn', 'public_cbt_btn', 'public_feed_visible',
]);

interface ApartCard { icon: string; title: string; body: string; cta: string; img: string; bg: string }
interface LeadershipCard { photo: string; name: string; position: string; bio: string }
interface AdmStep { icon: string; title: string; body: string }
interface StatItem { icon: string; number: string; suffix: string; caption: string }
interface LifeTab { icon: string; label: string; title: string; body: string; cta: string; img: string }

interface SavePayload {
  // Generic bag of whitelisted scalar columns — any subset of
  // SCALAR_FIELD_WHITELIST above. Lets one endpoint serve every
  // "plain form" section without a bespoke interface per section.
  fields?: Record<string, string | boolean | number | null>;
  apart_cards?: ApartCard[];
  leadership_cards?: LeadershipCard[];
  adm_card_steps?: AdmStep[];
  adm_card_docs?: string[];
  hp_stats?: StatItem[];
  life_tabs?: LifeTab[];
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

  if (body.fields) {
    for (const [key, val] of Object.entries(body.fields)) {
      if (!SCALAR_FIELD_WHITELIST.has(key)) {
        return new Response(JSON.stringify({ error: `Field not allowed: ${key}` }), { status: 400 });
      }
      if (BOOLEAN_FIELDS.has(key)) {
        update[key] = val !== false;
      } else if (key === 'admission_fee_default') {
        const n = Number(val);
        update[key] = Number.isFinite(n) ? n : 0;
      } else {
        update[key] = (val ?? '').toString().trim() || null;
      }
    }
  }

  if (body.apart_cards) {
    if (!Array.isArray(body.apart_cards)) {
      return new Response(JSON.stringify({ error: 'apart_cards must be an array.' }), { status: 400 });
    }
    update.hp_apart_cards = JSON.stringify(
      body.apart_cards.map((c) => ({
        icon: (c.icon || '').trim(), title: (c.title || '').trim(), body: (c.body || '').trim(),
        cta: (c.cta || '').trim(), img: (c.img || '').trim(), bg: c.bg || 'c1',
      }))
    );
  }

  if (body.leadership_cards) {
    if (!Array.isArray(body.leadership_cards)) {
      return new Response(JSON.stringify({ error: 'leadership_cards must be an array.' }), { status: 400 });
    }
    update.hp_leadership_cards = JSON.stringify(
      body.leadership_cards.map((c) => ({
        photo: (c.photo || '').trim(), name: (c.name || '').trim(),
        position: (c.position || '').trim(), bio: (c.bio || '').trim(),
      }))
    );
  }

  if (body.adm_card_steps) {
    if (!Array.isArray(body.adm_card_steps)) {
      return new Response(JSON.stringify({ error: 'adm_card_steps must be an array.' }), { status: 400 });
    }
    update.adm_card_steps = JSON.stringify(
      body.adm_card_steps
        .map((s) => ({ icon: (s.icon || '').trim(), title: (s.title || '').trim(), body: (s.body || '').trim() }))
        .filter((s) => s.title || s.body)
    );
  }

  if (body.adm_card_docs) {
    if (!Array.isArray(body.adm_card_docs)) {
      return new Response(JSON.stringify({ error: 'adm_card_docs must be an array.' }), { status: 400 });
    }
    update.adm_card_docs = JSON.stringify(body.adm_card_docs.map((d) => d.trim()).filter(Boolean));
  }

  if (body.hp_stats) {
    if (!Array.isArray(body.hp_stats)) {
      return new Response(JSON.stringify({ error: 'hp_stats must be an array.' }), { status: 400 });
    }
    update.hp_stats = JSON.stringify(
      body.hp_stats.map((s) => ({
        icon: (s.icon || '').trim(), number: (s.number || '').trim(),
        suffix: (s.suffix || '').trim(), caption: (s.caption || '').trim(),
      }))
    );
  }

  if (body.life_tabs) {
    if (!Array.isArray(body.life_tabs)) {
      return new Response(JSON.stringify({ error: 'life_tabs must be an array.' }), { status: 400 });
    }
    update.hp_life_tabs = JSON.stringify(
      body.life_tabs.map((t) => ({
        icon: (t.icon || '').trim(), label: (t.label || '').trim(), title: (t.title || '').trim(),
        body: (t.body || '').trim(), cta: (t.cta || '').trim(), img: (t.img || '').trim(),
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
