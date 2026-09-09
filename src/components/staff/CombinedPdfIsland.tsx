import { ToastProvider } from '../ui/Toast';
import CombinedPdfPage from './CombinedPdfPage';

interface Props {
  role: string;
  userId: string;
}

export default function CombinedPdfIsland(props: Props) {
  return (
    <ToastProvider>
      <CombinedPdfPage {...props} />
    </ToastProvider>
  );
}
