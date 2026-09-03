import type { ReactNode } from 'react';
import { useEffect } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export default function Modal({ open, onClose, title, children, footer }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-shell-obsidian/60" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-lg max-w-lg w-full p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 id="modal-title" className="font-heading font-bold text-lg text-brand-brown-dark">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-brand-brown-light hover:text-brand-brown-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold rounded-sm"
          >
            ✕
          </button>
        </div>
        <div className="font-body text-body">{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
