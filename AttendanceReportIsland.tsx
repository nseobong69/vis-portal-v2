import { ToastProvider } from '../ui/Toast';
import AttendanceReport from './AttendanceReport';

interface Props {
  session: string;
  term: string;
  classId: string;
  schoolName: string;
}

export default function AttendanceReportIsland(props: Props) {
  return (
    <ToastProvider>
      <AttendanceReport {...props} />
    </ToastProvider>
  );
}
