import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase, createAdminSupabase } from '../../../../lib/supabase';

export const prerender = false;

// Same email/password derivation as runStudentMigration()'s
// deriveEmail()/derivePassword() (index.html ~8905-8912).
function deriveEmail(s: { email?: string | null; admission_number?: string | null; id: string }) {
  if (s.email && s.email.includes('@')) return s.email.toLowerCase().trim();
  const safeAdm = (s.admission_number || String(s.id)).replace(/[/\\\s]/g, '').toLowerCase();
  return `${safeAdm}@student.vis.school`;
}
function derivePassword(s: { surname?: string | null; full_name?: string | null; admission_number?: string | null }) {
  const sur = (s.surname || s.full_name || '').toUpperCase().trim();
  return sur.length >= 2 ? sur : (s.admission_number || 'STUDENT123').toUpperCase();
}

export const POST: APIRoute = async ({ cookies }) => {
  const auth = await checkAuth(cookies, ['super_admin', 'admin']);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  const supabase = createServerSupabase(cookies);
  const log: string[] = [];

  const { data: students, error: fe } = await supabase.from('students').select('*').order('full_name');
  if (fe) return new Response(JSON.stringify({ error: fe.message }), { status: 500 });

  const toMigrate = (students || []).filter((s) => !s.auth_id);
  log.push(`✅ Already migrated: ${(students || []).filter((s) => s.auth_id).length}`);
  log.push(`🔄 To create: ${toMigrate.length}`);

  if (toMigrate.length === 0) {
    log.push('🎉 All students already have Auth accounts!');
    return new Response(JSON.stringify({ log, success: 0, skipped: 0, failed: 0 }), { status: 200 });
  }

  let admin;
  try {
    admin = createAdminSupabase();
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Admin client unavailable.' }), { status: 500 });
  }

  let success = 0, failed = 0, skipped = 0;
  for (const s of toMigrate) {
    const email = deriveEmail(s);
    const password = derivePassword(s);
    log.push(`${s.full_name} (${s.admission_number}) → ${email}`);
    try {
      const { data: au, error: ae } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (ae) {
        if (ae.message?.includes('already') || ae.message?.includes('exists')) {
          log.push('   ⚡ Already exists in Auth — skipped');
          skipped++;
          continue;
        }
        log.push(`   ❌ FAILED: ${ae.message}`);
        failed++;
        continue;
      }
      const uid = au?.user?.id;
      if (uid) await supabase.from('students').update({ auth_id: uid, has_account: true }).eq('id', s.id);
      log.push('   ✅ Created');
      success++;
    } catch (e) {
      log.push(`   ❌ ERROR: ${e instanceof Error ? e.message : 'Unknown error'}`);
      failed++;
    }
  }

  log.push('─────────────────────────────────');
  log.push(`DONE  ✅ ${success} created   ⚡ ${skipped} skipped   ❌ ${failed} failed`);

  return new Response(JSON.stringify({ log, success, skipped, failed }), { status: 200 });
};
