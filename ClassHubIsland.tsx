import { ToastProvider } from '../ui/Toast';
import ClassHub from './ClassHub';

interface Props {
  role: string;
  userId: string;
}

export default function ClassHubIsland(props: Props) {
  return (
    <ToastProvider>
      <ClassHub {...props} />
    </ToastProvider>
  );
}
