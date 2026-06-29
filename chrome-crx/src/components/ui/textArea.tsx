import React, { forwardRef, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Label, useGeneratedId } from './label';
import { useComposedRefs } from './refs';
import { ErrorMessage } from './errorMessage';

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

export interface TextAreaProps extends Omit<
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

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
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
