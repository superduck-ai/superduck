import type { ReactNode } from 'react';

export function Badge({
  color = 'default',
  size = 'default',
  children,
  className = '',
  uppercase = false,
  truncate = false
}: {
  color?: 'default' | 'flat' | 'secondary' | 'pro' | 'main' | 'danger';
  size?: 'default' | 'sm' | 'lg';
  children: ReactNode;
  className?: string;
  uppercase?: boolean;
  truncate?: boolean;
}) {
  const colorClasses = {
    default: 'bg-gradient-to-bl from-bg-500/30 to-bg-500/70 text-text-300',
    flat: 'bg-bg-500/40 text-text-200',
    secondary: 'bg-accent-secondary-900/40 text-accent-secondary-200',
    pro: 'bg-gradient-to-bl from-accent-pro-200 to-accent-pro-100 text-oncolor-100',
    main: 'bg-gradient-to-bl from-accent-main-200/70 to-accent-main-100 text-oncolor-100',
    danger: 'bg-danger-900 text-danger-200'
  };
  const sizeClasses = {
    default: 'h-5 px-1.5 rounded-md text-[0.625rem]',
    sm: 'h-4 px-1 rounded text-[0.625rem]',
    lg: 'h-6 px-2 rounded-lg text-xs'
  };

  return (
    <span
      className={`inline-flex items-center align-middle leading-none ${!truncate ? 'flex-shrink-0' : 'max-w-full'} ${colorClasses[color]} ${sizeClasses[size]} ${uppercase ? 'uppercase' : ''} ${className}`}
    >
      {truncate ? <span className="truncate">{children}</span> : children}
    </span>
  );
}
