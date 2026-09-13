import SchoolCalendar from './SchoolCalendar';

interface Props {
  initialEvents: Record<string, any>[];
  canManage: boolean;
}

export default function SchoolCalendarIsland(props: Props) {
  return <SchoolCalendar {...props} />;
}
