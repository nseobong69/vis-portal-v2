import type { SupabaseClient } from '@supabase/supabase-js';
import { calcTotals, genAffectiveTraits, teacherComment, principalComment, tieRank, isPupilClass, DEFAULT_PASS_MARK, type ResultRow, type Trait, type ClassSigData } from './resultCard';

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED CLASS PDF — server-side data layer.
//
// Ported from the old app's renderCombinedPDFPage()/generateCombinedPDF()/
// canGenerateCombinedPDF()/_getClassSigData()/getClassResultsForRanking()
// (index.html ~L10267-10522). The old app ran every one of these queries
// directly from the browser with an anonymous Supabase client — same
// RLS-empty-result bug already fixed elsewhere in this codebase (see
// src/lib/results.ts's header comment) — so this port runs them all here,
// server-side, with the caller's authenticated session (createServerSupabase),
// and returns one bulk payload the client then loops over to rasterise.
//
// html2canvas + jsPDF stay entirely client-side (they need a live DOM to
// rasterise each result card) — see src/components/staff/CombinedPdfPage.tsx.
// ═══════════════════════════════════════════════════════════════════════════

export interface ClassOptionWithLevel {
  id: string;
  name: string;
  arm: string | null;
  level: string | null;
}

/** Mirrors getMyClasses() (index.html L9315), extended to also select
 *  `level`, which the old app's inline dataset attribute carried but the
 *  existing fetchMyClasses() in results.ts doesn't need for its own screen. */
export async function fetchMyClassesWithLevel(
  supabase: SupabaseClient,
  role: string,
  userId: string
): Promise<ClassOptionWithLevel[]> {
  if (role === 'teacher') {
    const [{ data: tc }, { data: ts }] = await Promise.all([
      supabase.from('teacher_classes').select('class_id, classes(id, name, arm, level)').eq('teacher_id', userId),
      supabase.from('teacher_subjects').select('class_id, classes(id, name, arm, level)').eq('teacher_id', userId),
    ]);
    const seen = new Set<string>();
    const all: ClassOptionWithLevel[] = [];
    [...(tc ?? []), ...(ts ?? [])].forEach((r: any) => {
      const c = r.classes;
      if (c && !seen.has(c.id)) {
        seen.add(c.id);
        all.push(c);
      }
    });
    return all;
  }
  // super_admin / admin / proprietor / head_teacher / principal — full list.
  const { data } = await supabase.from('classes').select('id, name, arm, level').order('name');
  return data ?? [];
}

/** Mirrors canGenerateCombinedPDF(classLevel) — role/class-level permission
 *  gate. The teacher's-own-class check (teacher_classes membership) is done
 *  separately in the API route, same as the old app's two-step check. */
export function canGenerateCombinedPDF(role: string, classLevel: string | null | undefined): boolean {
  const isKNP = isPupilClass(classLevel || '');
  const isSec = !isKNP;
  if (role === 'super_admin' || role === 'admin' || role === 'proprietor') return true;
  if (role === 'head_teacher' && isKNP) return true;
  if (role === 'principal' && isSec) return true;
  if (role === 'teacher') return true; // class-membership checked by caller
  return false;
}

/** Mirrors _getClassSigData(classId, classNameOrLevel). */
export async function getClassSigData(
  supabase: SupabaseClient,
  schoolSettings: Record<string, any>,
  classId: string | null | undefined,
  classNameOrLevel: string | null | undefined
): Promise<ClassSigData> {
  const SS = schoolSettings;
  const isKNP = isPupilClass(classNameOrLevel || '');
  let sig: any = {};
  if (classId) {
    const { data: cs } = await supabase.from('class_signatures').select('*').eq('class_id', classId).maybeSingle();
    if (cs) sig = cs;
  }
  return {
    ctName: sig.class_teacher_name || SS.class_teacher_name || '',
    ctTitle: sig.class_teacher_title || SS.class_teacher_title || 'Class Teacher',
    ctSig: sig.ct_signature || null,
    htName: sig.head_name || (isKNP ? SS.head_teacher_name : SS.principal_name) || '',
    htTitle: sig.head_title || (isKNP ? SS.head_teacher_title || 'Head Teacher' : SS.principal_title || 'Principal'),
    htSig: sig.ht_signature || (isKNP ? SS.head_teacher_signature : SS.principal_signature) || null,
    htStamp: sig.ht_stamp || (isKNP ? SS.head_teacher_stamp : SS.principal_stamp) || SS.stamp_url || null,
  };
}

export interface CombinedPdfStudent {
  id: string;
  full_name: string;
  admission_number: string;
  class_id: string;
  class_name: string;
  avatar_url: string | null;
}

export interface CombinedPdfStudentPayload {
  student: CombinedPdfStudent;
  results: ResultRow[];
  traits: Trait[];
  pos: number | null;
  qrPin: string;
  classSigData: ClassSigData;
  /** Values needed by calcTotals() pre-computed here so the client doesn't
   *  need its own copy of the reducer — kept anyway in resultCard.ts since
   *  the single-result "My Results" download path also needs it client-side. */
  grand: number;
  totalObtainable: number;
  avg: number;
  pf: string;
  pfColor: string;
  tcComment: string;
  pcComment: string;
}

export interface CombinedPdfPayload {
  className: string;
  students: CombinedPdfStudentPayload[];
  schoolSettings: Record<string, any>;
}

/**
 * Mirrors the bulk-prefetch + per-student assembly section of
 * generateCombinedPDF() (index.html L10338-10447), minus the
 * html2canvas/jsPDF loop itself (client-side). Also mirrors the
 * auto-publish-unpublished-rows side effect, so a subject added after the
 * class's last bulk-publish still shows up here exactly like it does on
 * the PIN-verification view.
 */
export async function fetchCombinedPdfData(
  supabase: SupabaseClient,
  classId: string,
  className: string,
  term: string,
  session: string
): Promise<CombinedPdfPayload> {
  const { data: students } = await supabase
    .from('students')
    .select('id, full_name, admission_number, class_id, class_name, avatar_url')
    .eq('class_id', classId)
    .order('full_name');

  if (!students?.length) {
    return { className, students: [], schoolSettings: {} };
  }

  const sids = students.map((s) => s.id);
  const [{ data: settingsRows }, { data: allResults }, { data: allTraits }, { data: allPins }, { data: rankRows }] =
    await Promise.all([
      supabase.from('school_settings').select('*').limit(1).maybeSingle(),
      supabase.from('results').select('*').eq('class_id', classId).eq('term', term).eq('session', session),
      supabase.from('affective_traits').select('*').in('student_id', sids).eq('term', term).eq('session', session),
      supabase.from('result_pins_v2').select('student_id,pin').in('student_id', sids).eq('term', term).eq('session', session),
      supabase.from('results').select('student_id,total').eq('class_id', classId).eq('term', term).eq('session', session),
    ]);
  const schoolSettings = settingsRows || {};

  const resultsMap: Record<string, ResultRow[]> = {};
  (allResults || []).forEach((r: any) => {
    (resultsMap[r.student_id] ||= []).push(r);
  });
  const traitsMap: Record<string, { traits: Trait[] } | undefined> = {};
  (allTraits || []).forEach((t: any) => {
    traitsMap[t.student_id] = t;
  });
  const pinsMap: Record<string, string> = {};
  (allPins || []).forEach((p: any) => {
    pinsMap[p.student_id] = p.pin || '';
  });

  // Ranking list — same shape/sort as getClassResultsForRanking().
  const rankMap: Record<string, { student_id: string; total: number }> = {};
  (rankRows || []).forEach((r: any) => {
    const cur = (rankMap[r.student_id] ||= { student_id: r.student_id, total: 0 });
    cur.total += parseFloat(r.total) || 0;
  });
  const classResults = Object.values(rankMap).sort((a, b) => b.total - a.total);

  // Auto-publish any still-unpublished rows, exactly like the old app —
  // non-fatal if it fails, PDF generation continues either way.
  const unpublishedIds = (allResults || []).filter((r: any) => !r.published).map((r: any) => r.id);
  if (unpublishedIds.length) {
    try {
      await supabase.from('results').update({ published: true }).in('id', unpublishedIds);
    } catch {
      /* non-fatal */
    }
  }

  // Signature data cached per class_id (all students here share one class,
  // so this is a single lookup — kept as a map for parity/readability).
  const sigCache: Record<string, ClassSigData> = {};

  const passMark = Number(schoolSettings.pass_mark) || DEFAULT_PASS_MARK;
  const payload: CombinedPdfStudentPayload[] = [];
  for (const s of students) {
    const results = (resultsMap[s.id] || []).slice().sort((a, b) => a.subject_name.localeCompare(b.subject_name));
    const atData = traitsMap[s.id];
    const qrPin = pinsMap[s.id] || '';
    const { grand, totalObtainable, avg, pf, pfColor } = calcTotals(results, passMark);
    const pos = tieRank(classResults, s.id) || null;
    const traits = atData?.traits || genAffectiveTraits(avg);

    if (!sigCache[s.class_id]) {
      sigCache[s.class_id] = await getClassSigData(supabase, schoolSettings, s.class_id, s.class_name);
    }

    payload.push({
      student: s as CombinedPdfStudent,
      results,
      traits,
      pos,
      qrPin,
      classSigData: sigCache[s.class_id],
      grand,
      totalObtainable,
      avg,
      pf,
      pfColor,
      tcComment: teacherComment(avg),
      pcComment: principalComment(avg),
    });
  }

  return { className, students: payload, schoolSettings };
}
