import React, { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slottable } from '@radix-ui/react-slot';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

const TooltipRoot = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const DefaultTooltipContent = forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    className={cn(
      'px-2 py-1 text-xs font-normal font-ui leading-tight rounded-md shadow-md text-always-white bg-always-black/80 backdrop-blur break-words z-tooltip max-w-[13rem] text-pretty [*:disabled_&]:hidden',
      className
    )}
    {...props}
  />
));
DefaultTooltipContent.displayName = 'DefaultTooltipContent';

const primaryStyle =
  'bg-accent-main-100 text-oncolor-100 shadow-[inset_0_0.5px_0_hsla(var(--bg-000)/15%),0_0.5px_0.5px_hsla(var(--always-black)/18%)]';
const secondaryStyle =
  'bg-bg-000 text-text-200 border-border-300 hover:border-border-200 shadow-[0_0.5px_0.5px_hsla(var(--always-black)/6%)]';
const ghostStyle = 'bg-transparent text-text-200 hover:bg-bg-200';
const dangerStyle =
  'bg-danger-000 text-oncolor-100 shadow-[inset_0_0.5px_0_hsla(var(--bg-000)/15%),0_0.5px_0.5px_hsla(var(--always-black)/18%)]';
const superduckStyle = 'bg-accent-main-100 text-oncolor-100';

export const buttonVariants = cva(
  'inline-flex items-center justify-center relative shrink-0 can-focus select-none disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none disabled:drop-shadow-none',
  {
    variants: {
      variant: {
        primary:
          'font-base-bold relative overflow-hidden transition-transform will-change-transform ease-[cubic-bezier(0.165,0.85,0.45,1)] duration-150 hover:scale-y-[1.015] hover:scale-x-[1.005] backface-hidden',
        superduck: 'font-base-bold transition-colors',
        secondary:
          'font-base-bold border-0.5 relative overflow-hidden transition duration-100 backface-hidden',
        ghost:
          'border-transparent transition font-base duration-300 ease-[cubic-bezier(0.165,0.85,0.45,1)]',
        danger:
          'font-base-bold transition hover:scale-y-[1.015] hover:scale-x-[1.005] hover:opacity-95'
      },
      size: {
        default: 'h-9 px-4 py-2 rounded-lg min-w-[5rem] active:scale-[0.985] whitespace-nowrap',
        sm: 'h-8 rounded-md px-3 min-w-[4rem] active:scale-[0.985] whitespace-nowrap !text-xs',
        lg: 'h-11 rounded-[0.6rem] px-5 min-w-[6rem] active:scale-[0.985] whitespace-nowrap !text-base',
        icon: 'h-9 w-9 rounded-md active:scale-95 shrink-0',
        icon_xs: 'h-6 w-6 rounded-md active:scale-95',
        icon_sm: 'h-8 w-8 rounded-md active:scale-95',
        icon_lg: 'h-11 w-11 rounded-[0.6rem] active:scale-95'
      },
      option: { rounded: '!rounded-full', prepend: '', append: '' }
    },
    compoundVariants: [
      { size: 'default', option: 'prepend', class: 'pl-2 pr-3 gap-1' },
      { size: 'lg', option: 'prepend', class: 'pl-2.5 pr-3.5 gap-1' },
      { size: 'sm', option: 'prepend', class: 'pl-2 pr-2.5 gap-1' },
      { size: 'default', option: 'append', class: 'pl-3 pr-2 gap-1' },
      { size: 'lg', option: 'append', class: 'pl-3.5 pr-2.5 gap-1' },
      { size: 'sm', option: 'append', class: 'pl-2.5 pr-2 gap-1' }
    ],
    defaultVariants: { variant: 'primary', size: 'default' }
  }
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;

export interface ButtonProps
  extends
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color' | 'onClick'>,
    ButtonVariantProps {
  loading?: boolean;
  href?: string;
  target?: React.HTMLAttributeAnchorTarget;
  rel?: string;
  download?: string | boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  onLinkClick?: React.MouseEventHandler<HTMLAnchorElement>;
  prepend?: React.ReactNode;
  append?: React.ReactNode;
  tooltip?: React.ReactNode;
  tooltipSide?: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>['side'];
  tooltipDelay?: number;
  tooltipDisabled?: boolean;
  tooltipHoverable?: boolean;
  shortcut?: React.ReactNode;
  colorized?: boolean;
}

export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size,
      option,
      loading,
      href,
      onLinkClick,
      onClick,
      target,
      prepend,
      append,
      disabled,
      children,
      type = 'button',
      tooltip,
      tooltipSide = 'bottom',
      tooltipDelay,
      tooltipDisabled,
      tooltipHoverable: _tooltipHoverable = false,
      shortcut,
      colorized: _colorized,
      ...rest
    },
    ref
  ) => {
    if (prepend) option = 'prepend';
    if (append || shortcut) option = 'append';

    const isIconOnly = !children || (size && size.startsWith('icon'));
    const variantStyle = (() => {
      switch (variant) {
        case 'secondary':
          return secondaryStyle;
        case 'ghost':
          return ghostStyle;
        case 'danger':
          return dangerStyle;
        case 'superduck':
          return superduckStyle;
        default:
          return primaryStyle;
      }
    })();

    const buttonClass = cn(
      buttonVariants({ variant, size, option, className }),
      variantStyle,
      loading && '!text-transparent ![text-shadow:_none]'
    );
    const anchorRest = rest as React.AnchorHTMLAttributes<HTMLAnchorElement>;

    const content = (
      <>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
          </div>
        )}
        {prepend}
        {children && <Slottable>{children}</Slottable>}
        {shortcut && <kbd className="ml-1 text-xs opacity-60">{shortcut}</kbd>}
        {append}
      </>
    );

    const button = href ? (
      <a
        ref={ref as React.Ref<HTMLAnchorElement>}
        href={href}
        target={target}
        className={buttonClass}
        onClick={onLinkClick}
        {...anchorRest}
      >
        {content}
      </a>
    ) : (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type={type}
        className={buttonClass}
        disabled={disabled || loading}
        onClick={onClick}
        aria-label={
          !rest['aria-label'] && tooltip && isIconOnly && typeof tooltip === 'string'
            ? tooltip
            : undefined
        }
        {...rest}
      >
        {content}
      </button>
    );

    if (tooltip && !tooltipDisabled) {
      return (
        <TooltipRoot delayDuration={tooltipDelay}>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipPrimitive.Portal>
            <DefaultTooltipContent side={tooltipSide}>{tooltip}</DefaultTooltipContent>
          </TooltipPrimitive.Portal>
        </TooltipRoot>
      );
    }

    return button;
  }
);
Button.displayName = 'Button';
