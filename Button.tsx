import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'gold' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

// Text/background pairs below are chosen from the tokens.css contrast
// audit (Phase 2 style guide) — all meet WCAG AA (4.5:1 body / 3:1 large).
const variantClasses: Record<Variant, string> = {
  primary: 'bg-brand-brown text-white hover:bg-brand-brown-dark',
  gold: 'bg-brand-gold text-shell-obsidian shadow-gold hover:brightness-105',
  secondary: 'bg-white text-brand-brown border border-brand-cream-dark hover:bg-brand-cream',
  danger: 'bg-danger-700 text-white hover:brightness-110',
  ghost: 'bg-transparent text-brand-brown hover:bg-brand-cream',
};

const sizeClasses: Record<Size, string> = {
  sm: 'text-sm px-3 py-1.5',
  md: 'text-sm px-4 py-2',
  lg: 'text-base px-5 py-2.5',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={[
        'inline-flex items-center justify-center gap-2 rounded-md font-body font-medium',
        'transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:ring-offset-2',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
