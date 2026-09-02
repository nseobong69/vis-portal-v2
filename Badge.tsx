import type { ReactNode } from 'react';

type Tone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
}

// Soft backgrounds + dark text (not the raw semantic color with white
// text) — this combination clears AA at these font sizes without needing
// the -700 shades, and matches how index.html itself renders status
// chips (soft fill + darker text of the same hue).
const toneClasses: Record<Tone, string> = {
  success: 'bg-success-soft text-success-700',
  danger: 'bg-danger-soft text-danger-700',
  warning: 'bg-warning-soft text-warning-700',
  info: 'bg-info-soft text-info-700',
  neutral: 'bg-brand-cream text-brand-brown-dark',
};

export default function Badge({ tone = 'neutral', children }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center px-2.5 py-0.5 rounded-pill text-xs font-body font-semibold',
        toneClasses[tone],
      ].join(' ')}
    >
      {children}
    </span>
  );
}
