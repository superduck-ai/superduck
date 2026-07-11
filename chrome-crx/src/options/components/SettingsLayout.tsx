import React from 'react';
import { Badge, Card, CardContent, Separator, cn } from '@/components/ui';

function SettingsPage({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('space-y-8 md:space-y-10', className)} {...props} />;
}

function SettingsEyebrow({ children, className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mb-1.5 px-0.5',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function SettingsSection({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
  ...props
}: Omit<React.ComponentProps<typeof Card>, 'title'> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  contentClassName?: string;
}) {
  return (
    <Card
      size="sm"
      className={cn(
        'gap-0 rounded-xl border border-border py-0 shadow-none ring-0 bg-card overflow-hidden',
        className
      )}
      {...props}
    >
      {/* Elegant Card Header Area inside the Card */}
      <div className="border-b border-border/50 bg-muted/5 px-6 py-5 md:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <h2 className="text-[16px] md:text-[17px] font-bold leading-6 tracking-tight text-foreground">
              {title}
            </h2>
            {description && (
              <p className="text-[14px] leading-relaxed text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && (
            <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
              {actions}
            </div>
          )}
        </div>
      </div>

      {/* Card Content Area containing settings row items */}
      <CardContent className={cn('p-0', contentClassName)}>{children}</CardContent>
    </Card>
  );
}

function SettingsRow({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-3.5 px-6 py-5 md:px-8 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
      {...props}
    />
  );
}

function SettingsRowContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('min-w-0 flex-1 space-y-0.5', className)} {...props} />;
}

function SettingsRowTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('text-[14px] font-semibold leading-5 text-foreground', className)}
      {...props}
    />
  );
}

function SettingsRowDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p className={cn('text-[13px] leading-relaxed text-muted-foreground', className)} {...props} />
  );
}

function SettingsRowActions({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-wrap items-center gap-2 self-start sm:justify-end sm:self-center',
        className
      )}
      {...props}
    />
  );
}

function SettingsSeparator({ className, ...props }: React.ComponentProps<typeof Separator>) {
  return (
    <div className="px-6">
      <Separator className={cn('bg-border/60', className)} {...props} />
    </div>
  );
}

function StatusBadge({
  tone = 'neutral',
  className,
  ...props
}: React.ComponentProps<typeof Badge> & {
  tone?: 'neutral' | 'success' | 'warning' | 'destructive';
}) {
  const toneClassName = {
    neutral: 'border-border bg-muted/60 text-muted-foreground',
    success:
      'border-success/20 bg-success/5 text-success dark:border-success/30 dark:bg-success/10',
    warning: 'border-warning/20 bg-warning/10 text-warning',
    destructive: 'border-destructive/20 bg-destructive/10 text-destructive dark:bg-destructive/15'
  }[tone];

  return <Badge variant="outline" className={cn(toneClassName, className)} {...props} />;
}

function EmptySettingsState({
  icon,
  children,
  action,
  className
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-28 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border px-6 py-8 text-center text-[13px] text-muted-foreground',
        className
      )}
    >
      {icon && (
        <span className="flex size-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
          {icon}
        </span>
      )}
      <div className="max-w-sm">{children}</div>
      {action}
    </div>
  );
}

export {
  EmptySettingsState,
  SettingsPage,
  SettingsEyebrow,
  SettingsRow,
  SettingsRowActions,
  SettingsRowContent,
  SettingsRowDescription,
  SettingsRowTitle,
  SettingsSection,
  SettingsSeparator,
  StatusBadge
};
