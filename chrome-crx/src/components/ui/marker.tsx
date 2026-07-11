import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const markerVariants = cva(
  "group/marker relative flex min-h-4 w-full items-center gap-2 text-left text-sm text-muted-foreground [&_svg:not([class*='size-'])]:size-4 [a]:underline [a]:underline-offset-3 [a]:hover:text-foreground",
  {
    variants: {
      variant: {
        default: '',
        separator:
          'before:mr-1 before:h-px before:min-w-0 before:flex-1 before:bg-border after:ml-1 after:h-px after:min-w-0 after:flex-1 after:bg-border',
        border: 'border-b border-border pb-2'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
);

type MarkerRenderElement = React.ReactElement<React.HTMLAttributes<HTMLElement>>;

interface MarkerProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof markerVariants> {
  render?: MarkerRenderElement;
}

const Marker = React.forwardRef<HTMLDivElement, MarkerProps>(
  ({ className, variant = 'default', render, children, ...props }, ref) => {
    const resolvedVariant = variant ?? 'default';
    const markerClassName = cn(markerVariants({ variant: resolvedVariant, className }));
    const markerProps = {
      'data-slot': 'marker',
      'data-variant': resolvedVariant,
      className: markerClassName,
      children,
      ...props
    } satisfies React.HTMLAttributes<HTMLDivElement> & {
      'data-slot': string;
      'data-variant': NonNullable<typeof resolvedVariant>;
    };

    if (render) {
      return React.cloneElement(render, {
        ...markerProps,
        className: cn(render.props.className, markerClassName)
      });
    }

    return <div ref={ref} {...markerProps} />;
  }
);
Marker.displayName = 'Marker';

const MarkerIcon = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      data-slot="marker-icon"
      aria-hidden="true"
      className={cn("size-4 shrink-0 [&_svg:not([class*='size-'])]:size-4", className)}
      {...props}
    />
  )
);
MarkerIcon.displayName = 'MarkerIcon';

const MarkerContent = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      data-slot="marker-content"
      className={cn(
        'min-w-0 wrap-break-word group-data-[variant=separator]/marker:flex-none group-data-[variant=separator]/marker:text-center *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground',
        className
      )}
      {...props}
    />
  )
);
MarkerContent.displayName = 'MarkerContent';

export { Marker, MarkerIcon, MarkerContent, markerVariants };
