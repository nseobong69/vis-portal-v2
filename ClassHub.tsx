import { useEffect, useState } from 'react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Select from '../ui/Select';
import {
  HUB_ALLOWED,
  HUB_TABS,
  fetchMyHubClasses,
  fetchAutoSelectClassId,
  type ClassOption,
  type Role,
} from '../../lib/class-hub';
import StudentsTab from './class-hub/StudentsTab';
import SubjectRegTab from './class-hub/SubjectRegTab';
import CBTTab from './class-hub/CBTTab';
import AffectiveTraitsTab from './class-hub/AffectiveTraitsTab';
import PublishResultTab from './class-hub/PublishResultTab';
import ClearanceTab from './class-hub/ClearanceTab';
import AttendanceTab from './class-hub/AttendanceTab';
import PinsTab from './class-hub/PinsTab';
import { EnterScoresTab, ScoreSheetTab, MarkSheetTab } from './class-hub/ScoresTabs';

interface Props {
  role: string;
  userId: string;
}

const TERMS = ['1st Term', '2nd Term', '3rd Term'];
const SESSIONS = ['2024/2025', '2025/2026', '2026/2027', '2027/2028'];
// TODO(Phase 1 real session): source from SCHOOL_SETTINGS.school_name once
// the school-settings singleton is ported — same TODO as score-sheet.astro.
const SCHOOL_NAME = 'Victorious International Schools';

// Mirrors renderClassHub()/onHubClassChange()/switchHubTab(). The old
// app's access-denied branch (HUB_ALLOWED.includes(ROLE) === false) is
// handled one level up, server-side, in class-hub.astro's checkAuth() —
// so by the time this component mounts, `role` is already guaranteed to
// be in HUB_ALLOWED.
export default function ClassHub({ role, userId }: Props) {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classId, setClassId] = useState('');
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [term, setTerm] = useState(TERMS[0]);
  const [session, setSession] = useState(SESSIONS[1]);

  useEffect(() => {
    let cancelled = false;
    setLoadingClasses(true);
    Promise.all([
      fetchMyHubClasses(role as Role, userId),
      fetchAutoSelectClassId(role as Role, userId),
    ]).then(([list, autoId]) => {
      if (cancelled) return;
      setClasses(list);
      // Auto-select the teacher's own class, mirroring renderClassHub()'s
      // autoId logic — admin-tier roles get no auto-selection (there's no
      // single "their" class), same as the old app.
      if (autoId && list.some((c) => c.id === autoId)) {
        setClassId(autoId);
        const first = HUB_TABS.findIndex((t) => t.roles.includes(role as Role));
        if (first >= 0) setActiveTab(first);
      }
      setLoadingClasses(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, userId]);

  const selectedClass = classes.find((c) => c.id === classId);
  const className = selectedClass ? `${selectedClass.name}${selectedClass.arm ? ' ' + selectedClass.arm : ''}` : '';

  const visibleTabs = HUB_TABS.filter((t) => t.roles.includes(role as Role));

  const onClassChange = (id: string) => {
    setClassId(id);
    const first = HUB_TABS.findIndex((t) => t.roles.includes(role as Role));
    if (first >= 0) setActiveTab(first);
  };

  const renderTab = () => {
    if (!classId) return null;
    const key = HUB_TABS[activeTab]?.key;
    switch (key) {
      case 'students':
        return <StudentsTab classId={classId} className={className} />;
      case 'attendance':
        return <AttendanceTab userId={userId} />;
      case 'subject-reg':
        return <SubjectRegTab classId={classId} className={className} term={term} session={session} />;
      case 'cbt':
        return <CBTTab classId={classId} className={className} term={term} session={session} userId={userId} />;
      case 'enter-scores':
        return <EnterScoresTab role={role} userId={userId} />;
      case 'score-sheet':
        return <ScoreSheetTab role={role} userId={userId} schoolName={SCHOOL_NAME} />;
      case 'mark-sheet':
        return <MarkSheetTab role={role} userId={userId} schoolName={SCHOOL_NAME} />;
      case 'affective-traits':
        return <AffectiveTraitsTab classId={classId} className={className} term={term} session={session} />;
      case 'publish-result':
        return <PublishResultTab classId={classId} className={className} term={term} session={session} />;
      case 'pins':
        return <PinsTab className={className} />;
      case 'clearance':
        return <ClearanceTab classId={classId} className={className} />;
      default:
        return null;
    }
  };

  // Tabs that need a term/session context bar above them (mirrors the
  // per-tab term/session selects the old app renders inside each hub*()
  // function's own markup — hoisted here since several tabs share it).
  const showTermSession = ['subject-reg', 'cbt', 'affective-traits', 'publish-result'].includes(HUB_TABS[activeTab]?.key);

  if (!HUB_ALLOWED.includes(role as Role)) {
    // Defense in depth — the real gate is the server-side checkAuth() in
    // class-hub.astro; this branch should be unreachable in practice.
    return (
      <Card>
        <p className="text-center text-danger-700 font-semibold py-8">You do not have access to the Class Hub.</p>
      </Card>
    );
  }

  return (
    <div>
      <Card className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[210px]">
            <Select
              id="hub-csel"
              label="Select Class"
              value={classId}
              onChange={(e) => onClassChange(e.target.value)}
              placeholder={loadingClasses ? 'Loading…' : '— Choose a class —'}
              options={classes.map((c) => ({ value: c.id, label: `${c.name}${c.arm ? ' ' + c.arm : ''}` }))}
            />
          </div>
          {className && <Badge tone="neutral">{className}</Badge>}
        </div>
      </Card>

      {classId && (
        <>
          <div className="flex flex-wrap gap-1 bg-brand-cream p-1.5 rounded-xl mb-4">
            {visibleTabs.map((t) => {
              const idx = HUB_TABS.indexOf(t);
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(idx)}
                  className={[
                    'text-xs px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors',
                    idx === activeTab ? 'bg-brand-brown text-white' : 'text-brand-brown-dark hover:bg-white',
                  ].join(' ')}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {showTermSession && (
            <Card className="mb-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[110px]">
                  <Select
                    id="hub-term"
                    label="Term"
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    options={TERMS.map((t) => ({ value: t, label: t }))}
                  />
                </div>
                <div className="flex-1 min-w-[130px]">
                  <Select
                    id="hub-session"
                    label="Session"
                    value={session}
                    onChange={(e) => setSession(e.target.value)}
                    options={SESSIONS.map((s) => ({ value: s, label: s }))}
                  />
                </div>
              </div>
            </Card>
          )}

          {renderTab()}
        </>
      )}
    </div>
  );
}
