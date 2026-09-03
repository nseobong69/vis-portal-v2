import { ToastProvider } from '../ui/Toast';
import AttendanceMarker from './AttendanceMarker';

interface Props {
  autoLockClass: boolean;
  userId: string | null;
}

export default function AttendanceMarkerIsland(props: Props) {
  return (
    <ToastProvider>
      <AttendanceMarker {...props} />
    </ToastProvider>
  );
}
