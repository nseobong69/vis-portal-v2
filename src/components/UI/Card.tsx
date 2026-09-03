import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  footer?: ReactNode;
  children: ReactNode;
}

export default function Card({ title, footer, className = '', children, ...rest }: CardProps) {
  return (
    <div
      className={[
        'bg-white rounded-lg border border-brand-cream-dark shadow-sm p-5',
        className,
      ].join(' ')}
      {...rest}
    >
      {title && (
        <h3 className="font-heading font-bold text-brand-brown-dark text-lg mb-3">
          {title}
        </h3>
      )}
      <div className="font-body text-body">{children}</div>
      {footer && (
        <div className="mt-4 pt-4 border-t border-brand-cream-dark">{footer}</div>
      )}
    </div>
  );
}
