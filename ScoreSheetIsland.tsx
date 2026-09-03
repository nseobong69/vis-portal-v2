import { ToastProvider } from '../ui/Toast';
import ScoreSheet from './ScoreSheet';

interface Props {
  role: string;
  userId: string;
  schoolName: string;
}

export default function ScoreSheetIsland(props: Props) {
  return (
    <ToastProvider>
      <ScoreSheet {...props} />
    </ToastProvider>
  );
}
