import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Every parent-portal screen (Section 2.2: Parent Dashboard/Results/
 * Attendance/Fees/Messages/Documents/Test History/Profile) is scoped to
 * the parent's linked children via `parent_child_links` — never to the
 * parent's own id directly. This mirrors getActiveChild()/getSiblings()
 * from the old app's renderParentDash block (index.html), ported to run
 * server-side per request instead of off a client-held `UP` global.
 */
export type Child = {
  id: string;
  full_name: string;
  class_name?: string | null;
  class_id?: string | null;
  admission_number?: string | null;
};

export async function getSiblings(
  supabase: SupabaseClient,
  parentId: string
): Promise<Child[]> {
  const { data: links } = await supabase
    .from('parent_child_links')
    .select('student_id')
    .eq('parent_id', parentId);
  const ids = (links ?? []).map((l) => l.student_id);
  if (!ids.length) return [];
  const { data: students } = await supabase
    .from('students')
    .select('id, full_name, class_name, class_id, admission_number')
    .in('id', ids);
  return students ?? [];
}

/**
 * Resolves the "active child" for this request. The old app kept this in
 * a mutable `UP._activeChildId` client-side global and re-rendered in
 * place; a real server-rendered route can't do that (no persistent
 * client state to mutate), so the active child is a `?child=<id>` query
 * param instead — same effect (one child selected at a time, switchable
 * via a link), but a real URL per Section 3's routing requirement rather
 * than an in-memory flag. Falls back to the first linked child.
 */
export function resolveActiveChild(
  siblings: Child[],
  requestedId: string | null
): Child | null {
  if (!siblings.length) return null;
  if (requestedId) {
    const match = siblings.find((s) => s.id === requestedId);
    if (match) return match;
  }
  return siblings[0];
}
