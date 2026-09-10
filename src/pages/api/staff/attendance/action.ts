import type { APIRoute } from 'astro';
import { checkAuth } from '../../../../lib/auth';
import { createServerSupabase } from '../../../../lib/supabase';
import {
  getAttPrefs, saveAttPrefs, getTeacherAssignedClass, getWeeks, createWeek,
  getWeekDetail, getDayStatus, saveDayStatus, getDaySheet, saveDayAttendance, closeWeekManually,
} from '../../../../lib/attendanceMarking';

export const prerender = false;

// Subject teachers are blocked from marking (same as renderAttendance()'s
// gate) unless they also carry the plain 'teacher' role — checked below,
// not in this list, since checkAuth only sees the primary role string.
const ALLOWED_ROLES = ['super_admin', 'admin', 'proprietor', 'teacher'];

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await checkAuth(cookies, ALLOWED_ROLES);
  if (auth.status !== 'authorized') {
    return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }

  const supabase = createServerSupabase(cookies);
  const { action } = body;

  try {
    switch (action) {
      case 'init': {
        const [prefs, assignedClassId, classesRes] = await Promise.all([
          getAttPrefs(supabase, auth.userId),
          getTeacherAssignedClass(supabase, auth.userId),
          supabase.from('classes').select('id, name, arm').order('name'),
        ]);
        return new Response(
          JSON.stringify({ prefs, assignedClassId, classes: classesRes.data || [] }),
          { status: 200 }
        );
      }

      case 'savePrefs': {
        const { session, term, classId } = body;
        if (!session || !term || !classId) {
          return new Response(JSON.stringify({ error: 'Fill in Session, Term and Class.' }), { status: 400 });
        }
        const ok = await saveAttPrefs(supabase, auth.userId, session, term, classId);
        if (!ok) return new Response(JSON.stringify({ error: 'Could not save context.' }), { status: 500 });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      case 'getWeeks': {
        const { session, term, classId } = body;
        const weeks = await getWeeks(supabase, session, term, classId);
        return new Response(JSON.stringify({ weeks }), { status: 200 });
      }

      case 'createWeek': {
        const { session, term, classId, weekNum } = body;
        const result = await createWeek(supabase, session, term, classId, weekNum);
        if (!result.ok) return new Response(JSON.stringify({ error: result.error }), { status: 400 });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      case 'getWeekDetail': {
        const { weekId, session, term, classId } = body;
        const detail = await getWeekDetail(supabase, weekId, session, term, classId);
        return new Response(JSON.stringify(detail), { status: 200 });
      }

      case 'getDayStatus': {
        const { session, term, weekNum, day } = body;
        const status = await getDayStatus(supabase, session, term, weekNum, day);
        return new Response(JSON.stringify({ status }), { status: 200 });
      }

      case 'saveDayStatus': {
        const { date, weekNum, day, status, reason, session, term } = body;
        if (!date) return new Response(JSON.stringify({ error: 'Please select a date.' }), { status: 400 });
        if (status === 'closed' && !reason) {
          return new Response(JSON.stringify({ error: 'Please select a closure reason.' }), { status: 400 });
        }
        const result = await saveDayStatus(supabase, { date, weekNum, day, status, reason: reason || null, session, term, userId: auth.userId });
        if (!result.ok) return new Response(JSON.stringify({ error: result.error }), { status: 500 });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      case 'getDaySheet': {
        const { classId, date, session, term, weekId, day } = body;
        const sheet = await getDaySheet(supabase, classId, date, session, term, weekId, day);
        return new Response(JSON.stringify(sheet), { status: 200 });
      }

      case 'saveDayAttendance': {
        const { weekId, day, date, session, term, classId, weekNum, rows } = body;
        const result = await saveDayAttendance(supabase, { weekId, day, date, session, term, classId, weekNum, rows: rows || [], userId: auth.userId });
        if (!result.ok) return new Response(JSON.stringify({ error: result.error }), { status: 400 });
        return new Response(JSON.stringify({ ok: true, count: result.count, weekClosed: result.weekClosed }), { status: 200 });
      }

      case 'closeWeek': {
        const { weekId } = body;
        const result = await closeWeekManually(supabase, weekId);
        if (!result.ok) return new Response(JSON.stringify({ error: result.error }), { status: 500 });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400 });
    }
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Server error.' }), { status: 500 });
  }
};
