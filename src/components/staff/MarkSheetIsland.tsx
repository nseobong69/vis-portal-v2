import { ToastProvider } from '../ui/Toast';
import MarkSheet from './MarkSheet';

interface Props {
  role: string;
  userId: string;
  schoolName: string;
}

export default function MarkSheetIsland(props: Props) {
  return (
    <ToastProvider>
      <MarkSheet {...props} />
    </ToastProvider>
  );
}
