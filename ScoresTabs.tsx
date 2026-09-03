import ResultsSheet from '../ResultsSheet';
import ScoreSheet from '../ScoreSheet';
import MarkSheet from '../MarkSheet';

interface CommonProps {
  role: string;
  userId: string;
}

// Mirrors hubEnterScores()/hubLoadScoreEntry()/hubSaveScores(): SAME
// engine as the standalone Results / Enter Scores screen (results.ts),
// just surfaced inside the Hub. See the AttendanceTab.tsx comment for the
// same known gap — the class picker isn't yet pre-locked to _hubCid.
export function EnterScoresTab({ role, userId }: CommonProps) {
  return <ResultsSheet role={role} userId={userId} />;
}

interface WithSchool extends CommonProps {
  schoolName: string;
}

// Mirrors hubScoreSheet()/hubLoadSSPreview()/hubDownloadSSPDF(): SAME
// engine as the standalone Score Sheet screen (scoresheet.ts).
export function ScoreSheetTab({ role, userId, schoolName }: WithSchool) {
  return <ScoreSheet role={role} userId={userId} schoolName={schoolName} />;
}

// Mirrors hubMarkSheet()/hubLoadMarkSheet()/hubDownloadMKPDF(): SAME
// engine as the standalone Mark Sheet screen (scoresheet.ts). Old app
// restricts this tab to class-teacher-tier roles (not subject_teacher) —
// MarkSheet's own role check already enforces that.
export function MarkSheetTab({ role, userId, schoolName }: WithSchool) {
  return <MarkSheet role={role} userId={userId} schoolName={schoolName} />;
}
