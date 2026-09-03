import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type ToastTone = 'success' | 'danger' | 'warning' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  show: (tone: ToastTone, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Solid fill + white text, using the -700 tones so this clears AA (the
// base semantic tones alone fail 4.5:1 for white text — see the Phase 2
// style guide's contrast table).
const toneClasses: Record<ToastTone, string> = {
  success: 'bg-success-700 text-white',
  danger: 'bg-danger-700 text-white',
  warning: 'bg-warning-700 text-white',
  info: 'bg-info-700 text-white',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((tone: ToastTone, message: string) => {
    const id = Date.now();
    setToasts((t) => [...t, { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((item) => item.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              'rounded-md px-4 py-3 shadow-lg font-body text-sm min-w-[240px]',
              toneClasses[t.tone],
            ].join(' ')}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
