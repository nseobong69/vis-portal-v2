import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';

export const prerender = false;

// Ports renderAcademics()/_buildAcad*HTML()/showCreateAcademicModal()/
// loadAcadSubjects()/saveAcademicItem()/deleteAcadItem() (index.html
// ~26279-26505).
//
// NOT covered — separate sub-features, flagged rather than faked:
//  - openAILessonModal() ("AI Generate") — calls an external LLM to
//    draft a lesson note; a different integration entirely.
//  - viewAssignmentSubmissions() — a full submissions-review modal per
//    assignment (grading, scores). Submission COUNTS are included below
//    (loadSubmissionCounts equivalent), the review UI itself is not.
const ACAD_ROLES = ['super_admin', 'admin', 'head_teacher', 'principal', 'proprietor', 'teacher', 'subject_teacher'];

interface Body {
  action: 'list' | 'subjectsForClass' | 'signUpload' | 'create' | 'delete' | 'submissionCounts';
  classId?: string;
  purpose?: 'video' | 'image';
  type?: 'assignment' | 'note' | 'video';
  table?: string;
  id?: string;
  assignmentIds?: string[];
  payload?: Record<string, any>;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ACAD_ROLES);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }

  const supabase = createServerSupabase(cookies);

  if (body.action === 'list') {
    const [{ data: assignments }, { data: notes }, { data: videos }] = await Promise.all([
      supabase.from('academic_assignments').select('*').order('created_at', { ascending: false }).limit(30),
      supabase.from('academic_notes').select('*').order('created_at', { ascending: false }).limit(30),
      supabase.from('academic_videos').select('*').order('created_at', { ascending: false }).limit(30),
    ]);
    return new Response(JSON.stringify({ assignments: assignments || [], notes: notes || [], videos: videos || [] }), { status: 200 });
  }

  if (body.action === 'submissionCounts') {
    if (!body.assignmentIds?.length) return new Response(JSON.stringify({ counts: {} }), { status: 200 });
    const { data: subs } = await supabase.from('assignment_submissions').select('assignment_id').in('assignment_id', body.assignmentIds);
    const counts: Record<string, number> = {};
    (subs || []).forEach((s) => { counts[s.assignment_id] = (counts[s.assignment_id] || 0) + 1; });
    return new Response(JSON.stringify({ counts }), { status: 200 });
  }

  if (body.action === 'subjectsForClass') {
    if (!body.classId) return new Response(JSON.stringify({ error: 'Missing classId.' }), { status: 400 });
    const { data: cs } = await supabase.from('class_subjects').select('subject_id, subjects(id, name)').eq('class_id', body.classId);
    let subjects = (cs || []).map((r: any) => r.subjects).filter(Boolean);
    if (!subjects.length) {
      const { data: allSubs } = await supabase.from('subjects').select('id, name').order('name');
      subjects = allSubs || [];
    }
    return new Response(JSON.stringify({ subjects }), { status: 200 });
  }

  if (body.action === 'signUpload') {
    const cloudName = import.meta.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = import.meta.env.CLOUDINARY_API_KEY;
    const apiSecret = import.meta.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
      return new Response(JSON.stringify({ error: 'Cloudinary is not configured on the server.' }), { status: 500 });
    }
    const isVideo = body.purpose === 'video';
    const folder = isVideo ? 'vis/academic/videos' : 'vis/academic/images';
    const public_id = Math.random().toString(36).slice(2, 10);
    const timestamp = Math.floor(Date.now() / 1000);
    const toSign = `folder=${folder}&public_id=${public_id}&timestamp=${timestamp}${apiSecret}`;
    const signature = createHash('sha1').update(toSign).digest('hex');
    return new Response(JSON.stringify({ cloud_name: cloudName, api_key: apiKey, folder, public_id, timestamp, signature, resourceType: isVideo ? 'video' : 'image' }), { status: 200 });
  }

  if (body.action === 'create') {
    const p = body.payload || {};
    if (!p.class_id || !String(p.title || '').trim()) {
      return new Response(JSON.stringify({ error: 'Class and title are required.' }), { status: 400 });
    }
    const table = body.type === 'video' ? 'academic_videos' : body.type === 'assignment' ? 'academic_assignments' : 'academic_notes';
    const record: Record<string, any> = {
      class_id: p.class_id, class_name: p.class_name || '', subject_id: p.subject_id || null, subject_name: p.subject_name || '',
      title: String(p.title).trim(), term: p.term, session: p.session, created_by: auth.userId,
    };
    if (body.type === 'video') {
      record.video_url = p.video_url;
    } else {
      record.content = p.content || '';
      if (p.image_url) record.image_url = p.image_url;
      if (body.type === 'assignment') {
        record.submission_date = p.submission_date || null;
        record.type = p.assignment_type || 'assignment';
        record.max_score = Number(p.max_score) || 100;
      }
    }
    const { error } = await supabase.from(table).insert(record);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  if (body.action === 'delete') {
    if (!body.table || !body.id) return new Response(JSON.stringify({ error: 'Missing table or id.' }), { status: 400 });
    const allowed = ['academic_assignments', 'academic_notes', 'academic_videos'];
    if (!allowed.includes(body.table)) return new Response(JSON.stringify({ error: 'Invalid table.' }), { status: 400 });
    const { error } = await supabase.from(body.table).delete().eq('id', body.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Unknown action.' }), { status: 400 });
};
