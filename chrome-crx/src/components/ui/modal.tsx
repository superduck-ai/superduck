import React, { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { CloseIcon } from './icons';

export function ModalFooter({
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

export function Modal({
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
