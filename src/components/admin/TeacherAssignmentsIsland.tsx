import { ToastProvider } from '../ui/Toast';
import TeacherAssignments from './TeacherAssignments';

export default function TeacherAssignmentsIsland() {
  return (
    <ToastProvider>
      <TeacherAssignments />
    </ToastProvider>
  );
}
