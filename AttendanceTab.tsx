import AttendanceMarker from '../AttendanceMarker';

interface Props {
  userId: string;
}

// Mirrors hubAttendance()/hubAttLoad()/hubAttReport(): the Hub's
// Attendance tab is the SAME engine as the standalone /staff/attendance
// screen (attendance.ts — loadWeekPanel/saveAttPrefs/generateAttReport),
// just surfaced inside the Hub instead of on its own page. Reusing the
// already-built AttendanceMarker directly here (autoLockClass=false, same
// as the standalone route) rather than re-implementing the week-panel
// engine a second time.
//
// KNOWN GAP vs. the old app: the old hubAttendance() pre-locks the class
// picker to the Hub's currently-selected class (via saveAttPrefs(...,
// _hubCid) before rendering). AttendanceMarker here still shows its own
// class selector because it doesn't yet accept a `presetClassId` prop —
// follow-up: add that prop to AttendanceMarker so this tab can pass
// classId through and hide the picker, matching the old app exactly.
export default function AttendanceTab({ userId }: Props) {
  return <AttendanceMarker autoLockClass={false} userId={userId} />;
}
