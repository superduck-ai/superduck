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
    default: 'border border-border bg-card text-muted-foreground',
    flat: 'border border-transparent bg-muted text-muted-foreground',
    secondary: 'border border-border bg-secondary text-secondary-foreground',
    pro: 'border border-border/70 bg-muted/55 text-foreground dark:border-border/35 dark:bg-muted/20',
    main: 'border border-border/70 bg-muted/55 text-foreground dark:border-border/35 dark:bg-muted/20',
    danger: 'border border-destructive/20 bg-destructive/10 text-destructive'
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
