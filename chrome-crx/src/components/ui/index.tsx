import React, {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useIntl } from 'react-intl';
import { createLucideIcon } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { AnimatePresence, motion } from 'framer-motion';
import { Slottable } from '@radix-ui/react-slot';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import Calendar from 'react-calendar';
import _ from 'lodash';
import { cn } from '@/lib/utils';
import { formatLocalDateString, parseLocalDateString } from '@/utils/date';
import { isChineseLocale } from '@/utils/locale';

type RefCleanup = void | (() => void);
type ComposableRef<T> =
  | ((instance: T | null) => RefCleanup)
  | React.MutableRefObject<T | null>
  | null
  | undefined;

interface IconBaseProps extends Omit<React.ComponentPropsWithoutRef<'svg'>, 'color'> {
  alt?: string;
  color?: string;
  size?: number | string;
  weight?: string;
  mirrored?: boolean;
  weights: Map<string, React.ReactNode>;
}

function setRef<T>(ref: ComposableRef<T>, value: T | null): RefCleanup {
  if (typeof ref === 'function') return ref(value);
  if (typeof ref === 'object' && ref !== null && 'current' in ref) {
    ref.current = value;
  }
}

function composeRefs<T>(...refs: ComposableRef<T>[]) {
  const cleanups = new Map<ComposableRef<T>, () => void>();
  return (node: T | null) => {
    if (
      (refs.forEach((ref) => {
        const cleanup = setRef(ref, node);
        if (cleanup) cleanups.set(ref, cleanup);
      }),
      cleanups.size > 0)
    ) {
      return () => {
        refs.forEach((ref) => {
          const cleanup = cleanups.get(ref);
          cleanup ? cleanup() : setRef(ref, null);
        });
        cleanups.clear();
      };
    }
  };
}

function useComposedRefs<T>(...refs: ComposableRef<T>[]) {
  return useCallback(composeRefs(...refs), refs);
}

const CheckIcon = createLucideIcon('check', [['path', { d: 'M20 6 9 17l-5-5', key: '1gmf2c' }]]);

const ChevronDownIcon = createLucideIcon('chevron-down', [
  ['path', { d: 'm6 9 6 6 6-6', key: 'qrunsl' }]
]);

const ICON_SIZE_MAP: Record<number, number> = {
  12: 16,
  14: 16,
  16: 20,
  20: 20,
  24: 24,
  28: 28,
  32: 32
};

interface SuperDuckIconProps {
  size?: number;
  vectorSizeOverride?: number;
  className?: string;
  alt?: string;
  viewBox?: string;
  children?: React.ReactNode;
}

const SuperDuckIcon: React.FC<SuperDuckIconProps> = ({
  size = 20,
  vectorSizeOverride,
  className,
  alt,
  viewBox = '0 0 20 20',
  children
}) => {
  const vectorSize = vectorSizeOverride || ICON_SIZE_MAP[size];
  const svg = (
    <svg
      width={vectorSize}
      height={vectorSize}
      viewBox={viewBox}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
      className={className}
      aria-label={alt}
      aria-hidden={!alt}
    >
      {children}
    </svg>
  );

  if (vectorSizeOverride) return svg;

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {svg}
    </div>
  );
};

const ICON_SIZE_MAP_ALT: Record<number, number> = {
  12: 16,
  16: 20,
  20: 20,
  24: 24,
  28: 28,
  32: 32
};

const SuperDuckIconAlt: React.FC<SuperDuckIconProps> = ({
  size = 20,
  vectorSizeOverride,
  className,
  alt,
  viewBox = '0 0 20 20',
  children
}) => {
  const vectorSize = vectorSizeOverride || ICON_SIZE_MAP_ALT[size];
  const svg = (
    <svg
      width={vectorSize}
      height={vectorSize}
      viewBox={viewBox}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
      aria-label={alt}
      aria-hidden={!alt}
    >
      {children}
    </svg>
  );

  if (vectorSizeOverride) return svg;

  return (
    <div
      className={cn('flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      {svg}
    </div>
  );
};

const PhosphorIconContext = createContext({
  color: 'currentColor',
  size: '1em',
  weight: 'regular',
  mirrored: false
});

const IconBase = forwardRef<SVGSVGElement, IconBaseProps>((props, ref) => {
  const { alt, color, size, weight, mirrored, children, weights, ...rest } = props;
  const ctx = useContext(PhosphorIconContext);

  return React.createElement(
    'svg',
    {
      ref,
      xmlns: 'http://www.w3.org/2000/svg',
      width: size ?? ctx.size,
      height: size ?? ctx.size,
      fill: color ?? ctx.color,
      viewBox: '0 0 256 256',
      transform: mirrored || ctx.mirrored ? 'scale(-1, 1)' : undefined,
      ...rest
    },
    alt && React.createElement('title', null, alt),
    children,
    weights.get(weight ?? ctx.weight)
  );
});
IconBase.displayName = 'IconBase';

const CalendarIcon: React.FC<SuperDuckIconProps> = (props) => (
  <SuperDuckIcon {...props}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M13.4999 2.00037C13.776 2.00037 13.9999 2.22422 13.9999 2.50037V3.00037H15.4999C16.3283 3.00037 16.9999 3.67194 16.9999 4.50037V15.5004C16.9997 16.3286 16.3282 17.0004 15.4999 17.0004H4.49988C3.67163 17.0003 3.00008 16.3286 2.99988 15.5004V4.50037C2.99988 3.67198 3.67151 3.00043 4.49988 3.00037H5.99988V2.50037C5.99988 2.22426 6.22379 2.00043 6.49988 2.00037C6.77602 2.00037 6.99988 2.22422 6.99988 2.50037V3.00037H12.9999V2.50037C12.9999 2.22426 13.2238 2.00043 13.4999 2.00037ZM3.99988 15.5004C4.00008 15.7763 4.22392 16.0003 4.49988 16.0004H15.4999C15.7759 16.0004 15.9997 15.7763 15.9999 15.5004V8.00037H3.99988V15.5004ZM4.49988 4.00037C4.22379 4.00043 3.99988 4.22427 3.99988 4.50037V7.00037H15.9999V4.50037C15.9999 4.22422 15.776 4.00037 15.4999 4.00037H13.9999V5.50037C13.9997 5.77634 13.7759 6.00037 13.4999 6.00037C13.2239 6.0003 13.0001 5.7763 12.9999 5.50037V4.00037H6.99988V5.50037C6.99968 5.77634 6.7759 6.00037 6.49988 6.00037C6.22391 6.0003 6.00008 5.7763 5.99988 5.50037V4.00037H4.49988Z"
    />
  </SuperDuckIcon>
);

const CircleCheckIcon: React.FC<SuperDuckIconProps> = (props) => (
  <SuperDuckIcon {...props}>
    <path d="M10 2.5C14.1421 2.5 17.5 5.85786 17.5 10C17.5 14.1421 14.1421 17.5 10 17.5C5.85786 17.5 2.5 14.1421 2.5 10C2.5 5.85786 5.85786 2.5 10 2.5ZM10 3.5C6.41015 3.5 3.5 6.41015 3.5 10C3.5 13.5899 6.41015 16.5 10 16.5C13.5899 16.5 16.5 13.5899 16.5 10C16.5 6.41015 13.5899 3.5 10 3.5ZM12.6094 7.1875C12.7819 6.97187 13.0969 6.93687 13.3125 7.10938C13.5281 7.28188 13.5631 7.59687 13.3906 7.8125L9.39062 12.8125C9.30178 12.9236 9.16935 12.9912 9.02734 12.999C8.92097 13.0049 8.81649 12.9768 8.72852 12.9199L8.64648 12.8535L6.64648 10.8535L6.58203 10.7754C6.45387 10.5813 6.47562 10.3173 6.64648 10.1465C6.81735 9.97562 7.08131 9.95387 7.27539 10.082L7.35352 10.1465L8.97266 11.7656L12.6094 7.1875Z" />
  </SuperDuckIcon>
);

const VerticalDotsIcon: React.FC<SuperDuckIconProps> = (props) => (
  <SuperDuckIcon {...props}>
    <path d="M10 14C10.5523 14 11 14.4477 11 15C11 15.5523 10.5523 16 10 16C9.44772 16 9 15.5523 9 15C9 14.4477 9.44772 14 10 14ZM10 9C10.5523 9 11 9.44772 11 10C11 10.5523 10.5523 11 10 11C9.44772 11 9 10.5523 9 10C9 9.44772 9.44772 9 10 9ZM10 4C10.5523 4 11 4.44772 11 5C11 5.55228 10.5523 6 10 6C9.44772 6 9 5.55228 9 5C9 4.44772 9.44772 4 10 4Z" />
  </SuperDuckIcon>
);

const PenIcon: React.FC<SuperDuckIconProps> = (props) => (
  <SuperDuckIcon {...props}>
    <path d="M9.72821 2.87934C10.0318 2.10869 10.9028 1.72933 11.6735 2.03266L14.4655 3.13226C15.236 3.43593 15.6145 4.30697 15.3112 5.07758L11.3903 15.0307C11.2954 15.2717 11.1394 15.4835 10.9391 15.6459L10.8513 15.7123L7.7077 17.8979C7.29581 18.1843 6.73463 17.9917 6.57294 17.5356L6.54657 17.4409L5.737 13.6987C5.67447 13.4092 5.69977 13.107 5.80829 12.8315L9.72821 2.87934ZM6.73798 13.1987C6.70201 13.2903 6.69385 13.3906 6.71454 13.4868L7.44501 16.8627L10.28 14.892L10.3376 14.8452C10.3909 14.7949 10.4325 14.7332 10.4597 14.6645L13.0974 7.96723L9.37567 6.50141L6.73798 13.1987ZM11.3073 2.96332C11.0504 2.86217 10.7601 2.98864 10.6589 3.24555L9.74188 5.57074L13.4636 7.03754L14.3806 4.71137C14.4817 4.45445 14.3552 4.16413 14.0983 4.06293L11.3073 2.96332Z" />
  </SuperDuckIcon>
);

const TrashIcon: React.FC<SuperDuckIconProps> = (props) => (
  <SuperDuckIcon {...props}>
    <path d="M11.3232 1.5C11.9365 1.50011 12.4881 1.87396 12.7158 2.44336L13.3379 4H17.5L17.6006 4.00977C17.8285 4.0563 18 4.25829 18 4.5C18 4.7417 17.8285 4.94371 17.6006 4.99023L17.5 5H15.9629L15.0693 16.6152C15.0091 17.3965 14.3578 17.9999 13.5742 18H6.42578C5.6912 17.9999 5.07237 17.4697 4.94824 16.7598L4.93066 16.6152L4.03711 5H2.5C2.22387 5 2.00002 4.77613 2 4.5C2 4.22386 2.22386 4 2.5 4H6.66211L7.28418 2.44336L7.33105 2.33887C7.58152 1.82857 8.10177 1.5001 8.67676 1.5H11.3232ZM5.92773 16.5381C5.94778 16.7985 6.16464 16.9999 6.42578 17H13.5742C13.8354 16.9999 14.0522 16.7985 14.0723 16.5381L14.9609 5H5.03906L5.92773 16.5381ZM8.5 8C8.77613 8 8.99998 8.22388 9 8.5V13.5C9 13.7761 8.77614 14 8.5 14C8.22386 14 8 13.7761 8 13.5V8.5C8.00002 8.22388 8.22387 8 8.5 8ZM11.5 8C11.7761 8 12 8.22386 12 8.5V13.5C12 13.7761 11.7761 14 11.5 14C11.2239 14 11 13.7761 11 13.5V8.5C11 8.22386 11.2239 8 11.5 8ZM8.67676 2.5C8.49802 2.5001 8.33492 2.59525 8.24609 2.74609L8.21289 2.81445L7.73828 4H12.2617L11.7871 2.81445C11.7112 2.62471 11.5276 2.50011 11.3232 2.5H8.67676Z" />
  </SuperDuckIcon>
);

const WarningIcon: React.FC<SuperDuckIconProps> = (props) => (
  <SuperDuckIcon {...props}>
    <path d="M8.70798 3.70804C9.25201 2.78523 10.5372 2.72763 11.1738 3.53519L11.292 3.70804L17.792 14.7383C18.3812 15.7382 17.6606 17 16.5 17H3.49995C2.33937 17 1.61881 15.7382 2.20795 14.7383L8.70798 3.70804ZM10.3916 4.15824C10.1794 3.88887 9.75069 3.90817 9.56931 4.21586L3.06928 15.2461C2.87297 15.5794 3.11314 16 3.49995 16H16.5C16.8869 16 17.1271 15.5794 16.9307 15.2461L10.4306 4.21586L10.3916 4.15824ZM9.99998 13C10.4142 13 10.75 13.3358 10.75 13.75C10.7499 14.1642 10.4142 14.5 9.99998 14.5C9.58582 14.5 9.25002 14.1642 9.24998 13.75C9.24998 13.3358 9.58579 13.0001 9.99998 13ZM9.99998 8.00003C10.2761 8.00003 10.5 8.22389 10.5 8.50003V11.5C10.4999 11.7761 10.2761 12 9.99998 12C9.72389 12 9.50003 11.7761 9.49998 11.5V8.50003C9.49998 8.22391 9.72386 8.00007 9.99998 8.00003Z" />
  </SuperDuckIcon>
);

const CloseIcon: React.FC<SuperDuckIconProps> = (props) => (
  <SuperDuckIcon {...props}>
    <path d="M15.1465 4.14642C15.3418 3.95121 15.6583 3.95118 15.8536 4.14642C16.0487 4.34168 16.0488 4.65822 15.8536 4.85346L10.7071 9.99997L15.8536 15.1465C16.0487 15.3417 16.0488 15.6583 15.8536 15.8535C15.6828 16.0244 15.4187 16.0461 15.2247 15.918L15.1465 15.8535L10 10.707L4.85352 15.8535C4.65827 16.0486 4.34168 16.0486 4.14648 15.8535C3.95129 15.6583 3.95142 15.3418 4.14648 15.1465L9.293 9.99997L4.14648 4.85346C3.95142 4.65818 3.95129 4.34162 4.14648 4.14642C4.34168 3.95128 4.65825 3.95138 4.85352 4.14642L10 9.29294L15.1465 4.14642Z" />
  </SuperDuckIcon>
);

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

const buttonVariants = cva(
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

type ButtonVariantProps = VariantProps<typeof buttonVariants>;

interface ButtonProps
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

const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
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

const Label = forwardRef<
  HTMLLabelElement,
  { label?: React.ReactNode; id?: string; className?: string }
>(({ label, id, className }, ref) =>
  label ? (
    <label htmlFor={id} className={cn('text-text-200 mb-1 block font-base', className)} ref={ref}>
      {label}
    </label>
  ) : null
);
Label.displayName = 'Label';

function useGeneratedId({ id, label }: { id?: string; label?: React.ReactNode }) {
  return useMemo(
    () =>
      id ||
      (label && typeof label === 'string' ? _.uniqueId(`${_.camelCase(label)}_`) : _.uniqueId()),
    [label, id]
  );
}

const inputVariants = cva(
  'text-text-100 py-0 transition-colors can-focus cursor-text appearance-none w-full bg-bg-000 border border-border-300 hover:border-border-200 placeholder:text-text-500 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      size: {
        default: 'h-9 px-3 text-sm rounded-lg',
        sm: 'h-8 px-2 text-sm rounded-md',
        lg: 'h-11 px-3 text-base rounded-[0.6rem]'
      },
      error: {
        true: 'border-danger-100 hover:border-danger-100 focus:border-danger-100',
        false: ''
      }
    },
    defaultVariants: { size: 'default', error: false }
  }
);

type InputVariantProps = VariantProps<typeof inputVariants>;

type TextInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> &
  Omit<InputVariantProps, 'error'> & {
    label?: React.ReactNode;
    secondaryLabel?: React.ReactNode;
    labelClassName?: string;
    onValueChange?: (value: string) => void;
    automaticallyFocusAndSelect?: boolean;
    prepend?: React.ReactNode;
    append?: React.ReactNode;
    error?: boolean | string;
  };

const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  (
    {
      autoFocus,
      className,
      id,
      label,
      secondaryLabel,
      size = 'default',
      error,
      type,
      value,
      labelClassName,
      onChange,
      onValueChange,
      automaticallyFocusAndSelect,
      prepend,
      append,
      ...rest
    },
    ref
  ) => {
    const inputClass = cn(inputVariants({ size, error: Boolean(error), className }), className);
    const generatedId = useGeneratedId({ id, label });
    const innerRef = useRef<HTMLInputElement>(null);
    const composedRef = useComposedRefs(ref, innerRef);
    const isComposing = useRef(false);
    const [localValue, setLocalValue] = useState(value);

    useEffect(() => {
      if (automaticallyFocusAndSelect) {
        innerRef.current?.focus();
        innerRef.current?.select();
      }
    }, [automaticallyFocusAndSelect]);

    useEffect(() => {
      if (!isComposing.current) {
        setLocalValue(value);
      }
    }, [value]);

    const handleCompositionStart = () => {
      isComposing.current = true;
    };

    const handleCompositionEnd = (event: React.CompositionEvent<HTMLInputElement>) => {
      isComposing.current = false;
      const nextValue = event.currentTarget.value;
      setLocalValue(nextValue);
      onValueChange?.(nextValue);
    };

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;
      setLocalValue(nextValue);
      onChange?.(event);
      if (!isComposing.current) {
        onValueChange?.(nextValue);
      }
    };

    return (
      <>
        {label && <Label label={label} id={generatedId} className={labelClassName} />}
        {(prepend || append) && (
          <div
            className={cn(
              inputClass,
              'inline-flex cursor-text items-stretch gap-2 can-focus-within'
            )}
            onClick={() => innerRef.current?.focus()}
          >
            {prepend && <div className="flex items-center">{prepend}</div>}
            <input
              id={generatedId}
              autoFocus={autoFocus}
              type={type}
              className="w-full placeholder:text-text-500 m-0 bg-transparent p-0 hide-focus-ring disabled:cursor-not-allowed disabled:opacity-50"
              ref={composedRef}
              value={localValue}
              onChange={handleChange}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              {...rest}
            />
            {append && (
              <div
                className={cn(
                  'flex items-center',
                  size === 'default' && '-mr-2',
                  size === 'sm' && '-mr-2',
                  size === 'lg' && '-mr-1.5'
                )}
              >
                {append}
              </div>
            )}
          </div>
        )}
        {!(prepend || append) && (
          <input
            id={generatedId}
            autoFocus={autoFocus}
            type={type}
            className={inputClass}
            ref={composedRef}
            value={localValue}
            onChange={handleChange}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            {...rest}
          />
        )}
        {secondaryLabel && <div className="text-text-400 mt-1 text-sm">{secondaryLabel}</div>}
      </>
    );
  }
);
TextInput.displayName = 'TextInput';

function ErrorMessage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start gap-1', className)}>
      <WarningIcon className="text-danger-000 mt-1 shrink-0" size={16} />
      <p className="text-danger-000 text-sm">{children}</p>
    </div>
  );
}

interface TextAreaProps extends Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  'placeholder'
> {
  minRows?: number;
  label?: React.ReactNode;
  insetLabel?: boolean;
  labelClassName?: string;
  error?: boolean | string;
  onValueChange?: (value: string) => void;
  customScrollbar?: boolean;
  fullHeight?: boolean;
  placeholder?: string | string[];
}

const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  (
    {
      id,
      className,
      rows = 3,
      minRows,
      label,
      insetLabel,
      value,
      labelClassName,
      error,
      onChange,
      onValueChange,
      customScrollbar,
      fullHeight,
      placeholder,
      ...rest
    },
    ref
  ) => {
    const generatedId = useGeneratedId({ id, label });
    const innerRef = useRef<HTMLTextAreaElement>(null);
    const composedRef = useComposedRefs(ref, innerRef);
    const isArrayPlaceholder = Array.isArray(placeholder);
    const placeholderText = isArrayPlaceholder ? '' : placeholder;
    const isComposing = useRef(false);
    const [localValue, setLocalValue] = useState(value);

    useEffect(() => {
      if (!isComposing.current) {
        setLocalValue(value);
      }
    }, [value]);

    useEffect(() => {
      const element = innerRef.current;
      if (element && !fullHeight) {
        element.style.height = 'auto';
        element.style.height = `${element.scrollHeight}px`;
      }
    }, [localValue, fullHeight]);

    const handleCompositionStart = () => {
      isComposing.current = true;
    };

    const handleCompositionEnd = (event: React.CompositionEvent<HTMLTextAreaElement>) => {
      isComposing.current = false;
      const nextValue = event.currentTarget.value;
      setLocalValue(nextValue);
      onValueChange?.(nextValue);
    };

    const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const nextValue = event.target.value;
      setLocalValue(nextValue);
      onChange?.(event);
      if (!isComposing.current) {
        onValueChange?.(nextValue);
      }
    };

    return (
      <div className={cn(fullHeight && 'h-full flex flex-col')}>
        {label && !insetLabel && (
          <Label label={label} id={generatedId} className={labelClassName} />
        )}
        <div className={cn('relative', fullHeight && 'flex-1')}>
          {isArrayPlaceholder && (
            <PlaceholderRotator
              placeholders={placeholder as string[]}
              isShown={!localValue}
              className="text-text-500 font-base"
            />
          )}
          <textarea
            id={generatedId}
            ref={composedRef}
            rows={minRows || rows}
            value={localValue}
            placeholder={placeholderText}
            className={cn(
              'text-text-100 w-full bg-bg-000 border border-border-300 hover:border-border-200 rounded-lg p-3 transition-colors can-focus resize-none placeholder:text-text-500 disabled:cursor-not-allowed disabled:opacity-50',
              error && 'border-danger-100',
              fullHeight && 'h-full',
              customScrollbar && 'custom-scrollbar',
              className
            )}
            onChange={handleChange}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            {...rest}
          />
        </div>
        {typeof error === 'string' && error && (
          <div className="mt-1.5">
            <ErrorMessage>{error}</ErrorMessage>
          </div>
        )}
      </div>
    );
  }
);
TextArea.displayName = 'TextArea';

const PlaceholderRotator: React.FC<{
  placeholders: string[];
  isShown: boolean;
  className?: string;
  interval?: number;
}> = ({ placeholders, isShown, className, interval = 3000 }) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!isShown) return;
    const timer = setInterval(() => {
      setIndex((value) => (value + 1) % placeholders.length);
    }, interval);
    return () => clearInterval(timer);
  }, [placeholders.length, interval, isShown]);

  return (
    <div
      className={cn(
        'absolute top-0 left-0 right-0 bottom-0 w-full h-full p-3 pointer-events-none',
        !isShown && 'opacity-0',
        className
      )}
    >
      <AnimatePresence>
        <motion.p
          key={index}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.3 } }}
          exit={{ opacity: 0, y: -4 }}
          className="break-words absolute"
        >
          {placeholders[index]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
};

interface SegmentedControlOption {
  key: string;
  label: string;
  ariaLabel?: string;
}

const SegmentedControl: React.FC<{
  options: SegmentedControlOption[];
  onSelect?: (key: string) => void;
  initialKey?: string;
  selectedKey?: string;
  testId?: string;
  className?: string;
  itemClassName?: string;
  renderItem?: (
    element: React.ReactNode,
    option: SegmentedControlOption,
    state: { isSelected: boolean }
  ) => React.ReactNode;
  disabled?: boolean;
  rounded?: 'default' | 'full';
}> = ({
  options,
  onSelect,
  initialKey,
  selectedKey,
  testId,
  className,
  itemClassName,
  renderItem,
  disabled,
  rounded = 'default',
  ...rest
}) => {
  const isControlled = selectedKey !== undefined;
  const [internalKey, setInternalKey] = useState(initialKey);
  const bgRef = useRef<HTMLDivElement>(null);
  const [hasTransition, setHasTransition] = useState(false);
  const initialized = useRef(false);
  const activeKey = isControlled ? selectedKey : internalKey;

  useEffect(() => {
    const bg = bgRef.current;
    const parent = bg?.parentElement;
    if (!bg || !parent) return;
    const parentStyle = window.getComputedStyle(parent);
    const paddingLeft = parseFloat(parentStyle.paddingLeft);
    const borderRadius = parseFloat(parentStyle.borderRadius);
    const innerRadius = Math.max(0, borderRadius - paddingLeft);

    if (!activeKey) {
      bg.style.clipPath = `rect(0% ${2 * innerRadius}px 100% 0% round ${innerRadius}px)`;
      return;
    }

    const index = options.findIndex((option) => option.key === activeKey);
    const child = bg.children[index] as HTMLElement;
    if (!child) return;
    const totalWidth = bg.offsetWidth;
    if (totalWidth <= 0) return;

    const left = child.offsetLeft;
    const right = child.offsetLeft + child.offsetWidth;
    const clipRight = index === options.length - 1 ? 0 : 100 - (right / totalWidth) * 100;
    const clipLeft = index === 0 ? 0 : (left / totalWidth) * 100;
    bg.style.clipPath = `inset(0 ${clipRight > 0 ? clipRight : 0}% 0 ${clipLeft > 0 ? clipLeft : 0}% round ${innerRadius}px)`;

    if (!initialized.current) {
      initialized.current = true;
      requestAnimationFrame(() => setHasTransition(true));
    }
  }, [activeKey, options]);

  const itemClass = 'flex items-center justify-center h-[28px] min-w-7 gap-1.5 px-3 rounded-lg';
  const roundedClass = useMemo(
    () => (rounded === 'full' ? 'rounded-full' : 'rounded-[.625rem]'),
    [rounded]
  );

  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={activeKey}
      className={cn(
        'group/segmented-control relative inline-flex w-fit h-8 text-sm font-medium bg-bg-300 p-0.5 cursor-pointer select-none',
        className,
        roundedClass
      )}
      disabled={disabled}
      onValueChange={(value) => {
        if (value !== '') {
          setInternalKey(value);
          onSelect?.(value);
        }
      }}
      {...rest}
    >
      {options.map((option) => {
        const isSelected = activeKey === option.key;
        const item = (
          <ToggleGroupPrimitive.Item
            key={option.key}
            value={option.key}
            aria-label={option.ariaLabel}
            className={cn(
              itemClass,
              "text-text-500 hover:text-text-300 data-[state='on']:text-text-100 transition-colors duration-[250ms] motion-reduce:duration-0",
              itemClassName
            )}
            data-testid={testId ? `${testId}-${option.key}` : undefined}
          >
            {option.label}
          </ToggleGroupPrimitive.Item>
        );

        return renderItem ? renderItem(item, option, { isSelected }) : item;
      })}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 p-0.5 transition-[opacity] duration-[250ms]',
          !activeKey && 'opacity-0',
          roundedClass
        )}
        style={{ filter: 'drop-shadow(0px 0px 0.5px hsl(var(--border-300)/30%))' }}
      >
        <div
          ref={bgRef}
          className={cn(
            'relative flex bg-bg-000',
            hasTransition && 'transition-[clip-path] duration-[250ms] motion-reduce:duration-0 ease'
          )}
          style={{ clipPath: 'rect(0% 0% 100% 0%)' }}
        >
          {options.map((option) => (
            <div key={option.key} className={cn(itemClass, 'text-transparent')} aria-hidden>
              {option.label}
            </div>
          ))}
        </div>
      </div>
    </ToggleGroupPrimitive.Root>
  );
};

interface SimpleSelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

function SimpleSelect({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  disabled = false,
  className,
  label
}: {
  value: string;
  onChange: (value: string) => void;
  options: SimpleSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<'bottom' | 'top'>('bottom');
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handler);
    }

    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  return (
    <div className={className}>
      {label && <label className="block font-base text-text-200 mb-1">{label}</label>}
      <div ref={containerRef} className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => {
            if (disabled) return;
            if (buttonRef.current) {
              const rect = buttonRef.current.getBoundingClientRect();
              const spaceBelow = window.innerHeight - rect.bottom;
              const spaceAbove = rect.top;
              const menuHeight = Math.min(240, 40 * options.length + 16);
              setPosition(spaceBelow < menuHeight && spaceAbove > spaceBelow ? 'top' : 'bottom');
            }
            setIsOpen((open) => !open);
          }}
          disabled={disabled}
          className={cn(
            'w-full h-9 px-3 py-2 text-left border border-border-300 rounded-lg bg-bg-000 text-text-100 text-sm flex items-center justify-between transition-colors can-focus',
            !disabled && 'hover:border-border-200 cursor-pointer',
            isOpen && 'border-border-200',
            disabled && 'opacity-50 cursor-not-allowed bg-bg-100'
          )}
        >
          <span className="flex items-center gap-2">
            {selected?.icon}
            <span className={selected || placeholder ? '' : 'text-text-400'}>
              {selected?.label || placeholder}
            </span>
          </span>
          <ChevronDownIcon size={16} className="text-text-400" />
        </button>
        {isOpen && (
          <div
            className={cn(
              'absolute z-dropdown w-full bg-bg-000 border-0.5 border-border-200 rounded-xl backdrop-blur-xl shadow-[0px_2px_8px_0px_hsl(var(--always-black)/8%)] dark:shadow-[0px_2px_8px_0px_hsl(var(--always-black)/24%)] p-1.5 max-h-60 overflow-auto',
              position === 'bottom' ? 'mt-1 top-full' : 'mb-1 bottom-full'
            )}
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full px-2 py-2 text-left rounded-md transition-colors hover:bg-bg-200 flex items-center justify-between font-base'
                )}
              >
                <span className="flex items-center gap-2">
                  {option.icon}
                  <span className="text-text-100">{option.label}</span>
                </span>
                {value === option.value && (
                  <CheckIcon size={16} className="text-accent-secondary-100" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DatePicker({
  value,
  onChange,
  label,
  className,
  minDate
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
  minDate?: Date;
}) {
  type CalendarOnChangeValue = Parameters<
    NonNullable<React.ComponentProps<typeof Calendar>['onChange']>
  >[0];
  const intl = useIntl();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<'bottom' | 'top'>('bottom');
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dateValue = value ? parseLocalDateString(value) : null;

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handler);
    }

    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const formatDisplayDate = (dateString: string) => {
    if (!dateString) return '';
    const date = parseLocalDateString(dateString);
    return date.toLocaleDateString(intl.locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className={className}>
      {label && <label className="block font-base text-text-200 mb-1">{label}</label>}
      <div ref={containerRef} className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => {
            if (buttonRef.current) {
              const rect = buttonRef.current.getBoundingClientRect();
              const spaceBelow = window.innerHeight - rect.bottom;
              const spaceAbove = rect.top;
              const menuHeight = 320;
              setPosition(spaceBelow < menuHeight && spaceAbove > spaceBelow ? 'top' : 'bottom');
            }
            setIsOpen((open) => !open);
          }}
          className={cn(
            'w-full h-9 px-3 py-2 text-left border border-border-300 rounded-lg bg-bg-000 text-text-100 text-sm flex items-center justify-between gap-2 transition-all duration-200 can-focus hover:border-border-200 hover:shadow-sm cursor-pointer',
            isOpen && 'border-border-200 shadow-sm'
          )}
        >
          <span
            className={cn(
              'min-w-0 flex-1 whitespace-nowrap overflow-hidden text-ellipsis',
              value ? '' : 'text-text-400'
            )}
          >
            {value
              ? formatDisplayDate(value)
              : intl.formatMessage({ defaultMessage: 'Select date', id: 'select_date' })}
          </span>
          <CalendarIcon size={16} className="text-text-400 shrink-0" />
        </button>
        {isOpen && (
          <div
            className={cn(
              'absolute z-dropdown min-w-[280px] bg-bg-000 border-0.5 border-border-200 rounded-xl backdrop-blur-xl shadow-[0px_4px_16px_0px_hsl(var(--always-black)/12%)] dark:shadow-[0px_4px_16px_0px_hsl(var(--always-black)/32%)] p-3',
              position === 'bottom' ? 'mt-1 top-full' : 'mb-1 bottom-full'
            )}
          >
            <Calendar
              value={dateValue}
              onChange={(date: CalendarOnChangeValue) => {
                if (date instanceof Date) {
                  onChange(formatLocalDateString(date));
                  setIsOpen(false);
                }
              }}
              minDate={minDate}
              locale={intl.locale}
              className="datetime-input-calendar"
              formatDay={(_, date) => date.getDate().toString()}
              formatShortWeekday={(locale, date) => {
                const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
                const weekdaysEn = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
                return isChineseLocale(locale)
                  ? weekdays[date.getDay()]
                  : weekdaysEn[date.getDay()];
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function isValidTime(value: string): boolean {
  return /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/.test(value);
}

function parseTimeInput(input: string): string | null {
  const trimmed = input.trim();
  if (isValidTime(trimmed)) {
    const [hours, minutes] = trimmed.split(':');
    return `${hours.padStart(2, '0')}:${minutes}`;
  }

  const normalized = trimmed
    .replace(/上午/g, 'AM ')
    .replace(/下午/g, 'PM ')
    .replace(/中午/g, 'PM ')
    .replace(/凌晨/g, 'AM ')
    .replace(/\s+/g, ' ')
    .trim();

  const match = normalized.match(/^(?:(am|pm|AM|PM)\s*)?(\d{1,2}):(\d{2})(?:\s*(am|pm|AM|PM))?$/);
  if (!match) return null;

  const prefixPeriod = match[1];
  const suffixPeriod = match[4];
  let hours = parseInt(match[2], 10);
  const minutes = match[3];
  const period = (prefixPeriod || suffixPeriod)?.toUpperCase();

  if (!period) return null;
  if (hours < 1 || hours > 12 || parseInt(minutes, 10) > 59) return null;

  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;

  return `${hours.toString().padStart(2, '0')}:${minutes}`;
}

function formatTime12h(value: string): string {
  if (!isValidTime(value)) return value;
  const [hoursValue, minutes] = value.split(':');
  const hours = parseInt(hoursValue, 10);
  return `${hours === 0 ? 12 : hours > 12 ? hours - 12 : hours}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
}

function formatTimeForLocale(value: string, locale?: string): string {
  if (!isValidTime(value)) return value;
  if (isChineseLocale(locale)) return value;
  return formatTime12h(value);
}

function TimeInput({
  value,
  onChange,
  label,
  className
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}) {
  const intl = useIntl();
  const isChinese = isChineseLocale(intl.locale);
  const [display, setDisplay] = useState(formatTimeForLocale(value, intl.locale));
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<'bottom' | 'top'>('bottom');
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const timeOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    for (let hours = 0; hours < 24; hours++) {
      for (let minutes = 0; minutes < 60; minutes += 15) {
        const nextValue = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        options.push({
          value: nextValue,
          label: isChinese ? nextValue : formatTime12h(nextValue)
        });
      }
    }
    return options;
  }, [isChinese]);

  useEffect(() => {
    setDisplay(formatTimeForLocale(value, intl.locale));
    setError(null);
  }, [value, intl.locale]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const updatePosition = () => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const menuHeight = Math.min(192, 40 * timeOptions.length + 16);
    setPosition(spaceBelow < menuHeight && spaceAbove > spaceBelow ? 'top' : 'bottom');
  };

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;
      setDisplay(nextValue);
      setError(null);
      const parsed = parseTimeInput(nextValue);
      if (parsed) {
        onChange(parsed);
      }
    },
    [onChange]
  );

  const handleBlur = useCallback(() => {
    const parsed = parseTimeInput(display);
    if (parsed) {
      setDisplay(formatTimeForLocale(parsed, intl.locale));
      onChange(parsed);
      setError(null);
      return;
    }
    if (display.trim() !== '') {
      setError(intl.formatMessage({ defaultMessage: 'Invalid time format', id: '/6iExgDC34' }));
      setDisplay(formatTimeForLocale(value, intl.locale));
    }
  }, [display, intl, onChange, value]);

  const selectTime = useCallback(
    (nextValue: string) => {
      onChange(nextValue);
      setDisplay(formatTimeForLocale(nextValue, intl.locale));
      setIsOpen(false);
      setError(null);
    },
    [intl.locale, onChange]
  );

  return (
    <div className={cn('relative', className)}>
      {label && (
        <label className="block font-ui-serif text-sm font-semibold text-text-200 mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={display}
          onChange={handleInputChange}
          onFocus={() => {
            updatePosition();
            setIsOpen(true);
          }}
          onBlur={handleBlur}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleBlur();
              setIsOpen(false);
            } else if (event.key === 'Escape') {
              setIsOpen(false);
              setDisplay(formatTimeForLocale(value, intl.locale));
              setError(null);
            } else if (event.key === 'ArrowDown' && !isOpen) {
              setIsOpen(true);
            }
          }}
          lang={intl.locale}
          placeholder={intl.formatMessage({
            defaultMessage: 'e.g., 9:30 AM or 14:00',
            id: 'time_input_placeholder'
          })}
          className={cn(
            'w-full h-9 px-3 pr-10 py-2 border rounded-lg bg-bg-000 text-text-100 text-sm transition-colors can-focus hover:border-border-200',
            error ? 'border-danger-100' : 'border-border-300'
          )}
        />
        <button
          type="button"
          onClick={() => {
            updatePosition();
            setIsOpen((open) => !open);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-text-300 hover:text-text-100"
          tabIndex={-1}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      {error && <p className="text-xs text-danger-100 mt-1">{error}</p>}
      {isOpen && (
        <div
          ref={dropdownRef}
          className={cn(
            'absolute z-dropdown w-full max-h-48 overflow-auto bg-bg-000 border-0.5 border-border-200 rounded-xl backdrop-blur-xl shadow-[0px_2px_8px_0px_hsl(var(--always-black)/8%)] dark:shadow-[0px_2px_8px_0px_hsl(var(--always-black)/24%)] p-1.5',
            position === 'bottom' ? 'mt-1 top-full' : 'mb-1 bottom-full'
          )}
        >
          {timeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                selectTime(option.value);
              }}
              className={cn(
                'w-full text-left px-2 py-2 rounded-md transition-colors hover:bg-bg-200 text-sm',
                option.value === value ? 'bg-bg-200 text-text-100' : 'text-text-100'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ModalFooter({
  children,
  layout = 'right',
  className
}: {
  children: React.ReactNode;
  layout?: 'left' | 'center' | 'right' | 'between';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mt-4 flex flex-col gap-2',
        layout === 'left' && 'sm:flex-row',
        layout === 'center' && 'justify-center sm:flex-row',
        layout === 'right' && 'sm:flex-row justify-end',
        layout === 'between' && 'justify-between sm:flex-row',
        className
      )}
    >
      {children}
    </div>
  );
}

function Modal({
  title,
  subtitle,
  isOpen,
  className,
  children,
  onClose,
  icon,
  modalSize = 'md',
  hasCloseButton = false,
  overlayClassName,
  placement = 'center'
}: {
  title?: string;
  subtitle?: string;
  isOpen: boolean;
  className?: string;
  children: React.ReactNode;
  onClose: () => void;
  icon?: React.ReactNode;
  modalSize?: 'sm' | 'md' | 'lg' | '2lg' | 'xl' | '2xl' | '3xl';
  hasCloseButton?: boolean;
  overlayClassName?: string;
  placement?: 'center' | 'top' | 'center-locked';
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const overlayMouseDownTarget = useRef<EventTarget | null>(null);
  const [lockedTop, setLockedTop] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!isOpen || placement !== 'center-locked' || lockedTop !== null || !modalRef.current) {
      return;
    }
    const rect = modalRef.current.getBoundingClientRect();
    setLockedTop(Math.max(16, rect.top));
  }, [isOpen, lockedTop, placement]);

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'fixed z-50 inset-0 grid justify-items-center overflow-y-auto md:p-10 p-4',
        placement === 'top' || (placement === 'center-locked' && lockedTop !== null)
          ? 'items-start'
          : 'items-center',
        '[background-color:hsl(var(--always-black)/0.5)]',
        overlayClassName
      )}
      style={
        placement === 'center-locked' && lockedTop !== null
          ? { paddingTop: `${lockedTop}px` }
          : undefined
      }
      onPointerDownCapture={(event) => {
        overlayMouseDownTarget.current = event.target;
      }}
      onClick={(event) => {
        if (
          event.target === event.currentTarget &&
          overlayMouseDownTarget.current === event.currentTarget
        ) {
          overlayMouseDownTarget.current = null;
          onClose();
        } else {
          overlayMouseDownTarget.current = null;
        }
      }}
    >
      <div
        ref={modalRef}
        className={cn(
          'flex flex-col focus:outline-none relative text-text-100 text-left shadow-xl border-0.5 border-border-300 rounded-2xl md:p-6 p-4 w-full min-w-0 bg-bg-100',
          modalSize === 'sm' && 'max-w-sm',
          modalSize === 'md' && 'max-w-md',
          modalSize === 'lg' && 'max-w-lg',
          modalSize === '2lg' && 'max-w-xl',
          modalSize === 'xl' && 'max-w-3xl',
          modalSize === '2xl' && 'max-w-5xl',
          modalSize === '3xl' && 'max-w-6xl',
          className
        )}
      >
        <div className="min-h-full flex flex-col">
          {!!(title || hasCloseButton) && (
            <div
              className={cn('flex items-center gap-4', title ? 'justify-between' : 'justify-end')}
            >
              {title && (
                <h2 className="font-xl-bold text-text-100 flex w-full min-w-0 items-center leading-6 break-words">
                  {icon && <span className="mr-2">{icon}</span>}
                  <span className="[overflow-wrap:anywhere]">{title}</span>
                </h2>
              )}
              {hasCloseButton && (
                <Button
                  size="icon_sm"
                  variant="ghost"
                  className="!text-text-500 hover:!text-text-400 -mx-2"
                  onClick={onClose}
                >
                  <CloseIcon size={16} />
                </Button>
              )}
            </div>
          )}
          {subtitle && <p className="text-text-300 mb-2 text-sm">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

const DROPDOWN_ITEM_BASE_CLASS =
  'font-base min-h-8 px-2 py-1.5 rounded-lg cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis grid grid-cols-[minmax(0,_1fr)_auto] gap-2 items-center outline-none select-none hover:bg-bg-200 hover:text-text-000';

function DropdownMenu({
  trigger,
  children,
  unstyledTrigger = false
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  unstyledTrigger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  void unstyledTrigger;

  type ClosableDropdownMenuItemProps = {
    __closeMenu?: () => void;
  };

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((value) => !value)}>{trigger}</div>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-bg-000 border-0.5 border-border-200 backdrop-blur-xl rounded-xl min-w-[8rem] text-text-300 shadow-[0px_2px_8px_0px_hsl(var(--always-black)/8%)] p-1.5">
          {React.Children.map(children, (child) =>
            React.isValidElement<ClosableDropdownMenuItemProps>(child)
              ? React.cloneElement(child, {
                  __closeMenu: () => setOpen(false)
                })
              : child
          )}
        </div>
      )}
    </div>
  );
}

function DropdownMenuItem({
  icon,
  children,
  onSelect,
  danger,
  trailing,
  __closeMenu
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  trailing?: React.ReactNode;
  __closeMenu?: () => void;
}) {
  return (
    <div
      className={cn(DROPDOWN_ITEM_BASE_CLASS, danger && '!text-danger-000 hover:bg-danger-900')}
      onClick={() => {
        onSelect?.();
        __closeMenu?.();
      }}
    >
      {icon || trailing ? (
        <div className="flex items-center gap-2 w-full font-base group">
          {icon}
          <span className="flex-1 truncate">{children}</span>
          {trailing && <div className="flex items-center flex-shrink-0 -mr-2">{trailing}</div>}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

export {
  Button,
  CalendarIcon,
  CircleCheckIcon,
  CloseIcon,
  DropdownMenu,
  DropdownMenuItem,
  ErrorMessage,
  IconBase,
  Label,
  Modal,
  ModalFooter,
  PenIcon,
  SegmentedControl,
  SimpleSelect,
  SuperDuckIcon,
  SuperDuckIconAlt,
  TextArea,
  TextInput,
  TimeInput,
  DatePicker,
  TrashIcon,
  VerticalDotsIcon,
  WarningIcon,
  PhosphorIconContext,
  cn,
  useComposedRefs
};
