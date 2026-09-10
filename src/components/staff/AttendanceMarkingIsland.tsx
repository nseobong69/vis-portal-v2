import { ToastProvider } from '../ui/Toast';
import AttendanceMarking from './AttendanceMarking';

interface Props {
  role: string;
  isSubjectTeacherOnly: boolean;
}

export default function AttendanceMarkingIsland(props: Props) {
  return (
    <ToastProvider>
      <AttendanceMarking {...props} />
    </ToastProvider>
  );
}
