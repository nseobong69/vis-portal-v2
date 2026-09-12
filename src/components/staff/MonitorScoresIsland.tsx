import { ToastProvider } from '../ui/Toast';
import MonitorScores from './MonitorScores';

interface Props {
  role: string;
  userId: string;
}

export default function MonitorScoresIsland(props: Props) {
  return (
    <ToastProvider>
      <MonitorScores {...props} />
    </ToastProvider>
  );
}

