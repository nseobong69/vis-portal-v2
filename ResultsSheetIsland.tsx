import { ToastProvider } from '../ui/Toast';
import ResultsSheet from './ResultsSheet';

interface Props {
  role: string;
  userId: string;
}

export default function ResultsSheetIsland(props: Props) {
  return (
    <ToastProvider>
      <ResultsSheet {...props} />
    </ToastProvider>
  );
}
