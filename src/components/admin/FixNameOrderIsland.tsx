import { ToastProvider } from '../ui/Toast';
import FixNameOrderManager from './FixNameOrderManager';

interface ClassOption { id: string; name: string; arm: string | null }

export default function FixNameOrderIsland({ classes }: { classes: ClassOption[] }) {
  return (
    <ToastProvider>
      <FixNameOrderManager classes={classes} />
    </ToastProvider>
  );
}
