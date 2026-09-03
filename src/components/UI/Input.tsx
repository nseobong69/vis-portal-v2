import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  id: string;
}

export default function Input({ label, error, id, className = '', ...rest }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-body font-medium text-brand-brown-dark">
          {label}
        </label>
      )}
      <input
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={[
          'font-body text-sm text-body rounded-sm border px-3 py-2',
          'bg-white placeholder:text-brand-brown-light',
          'focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold',
          error ? 'border-danger-700' : 'border-brand-cream-dark',
          className,
        ].join(' ')}
        {...rest}
      />
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}
