import React, { forwardRef, useEffect, useRef, useState } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Label, useGeneratedId } from './label';
import { useComposedRefs } from './refs';

export const inputVariants = cva(
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

export type InputVariantProps = VariantProps<typeof inputVariants>;

export type TextInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> &
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

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
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
