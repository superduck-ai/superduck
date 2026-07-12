import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { isImageFile, isPdfFile } from './fileUtils';

function FileUploadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

type DragState =
  | 'IDLE'
  | 'DRAGGING_ON_TARGET'
  | 'DRAGGING_OFF_TARGET'
  | 'DRAGGING_INVALID'
  | 'DROPPED';

interface DropZoneProps {
  onDrop: (e: React.DragEvent) => void;
  children: React.ReactNode;
  disabled?: boolean;
}

export function DropZone({ onDrop, children, disabled }: DropZoneProps) {
  const [dragState, setDragState] = useState<DragState>('IDLE');
  const dragCounterRef = useRef(0);
  const targetRef = useRef<HTMLDivElement>(null);

  const hasValidFiles = useCallback((e: React.DragEvent) => {
    const items = Array.from(e.dataTransfer.items);
    return items.some((item) => {
      if (item.kind !== 'file') return false;
      return isImageFile(item.type) || isPdfFile(item.type);
    });
  }, []);

  const handleTargetDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;

      dragCounterRef.current++;
      if (hasValidFiles(e)) {
        setDragState('DRAGGING_ON_TARGET');
      } else {
        setDragState('DRAGGING_INVALID');
      }
    },
    [disabled, hasValidFiles]
  );

  const handleTargetDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;

      dragCounterRef.current--;
      if (dragCounterRef.current === 0) {
        setDragState('DRAGGING_OFF_TARGET');
      }
    },
    [disabled]
  );

  const handleTargetDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
    },
    [disabled]
  );

  const handleTargetDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;

      dragCounterRef.current = 0;
      setDragState('DROPPED');

      if (hasValidFiles(e)) {
        onDrop(e);
      }

      setTimeout(() => setDragState('IDLE'), 300);
    },
    [disabled, hasValidFiles, onDrop]
  );

  useEffect(() => {
    if (disabled) return;

    const handleDocumentDragEnter = (e: DragEvent) => {
      e.preventDefault();
      if (dragState === 'IDLE') {
        setDragState('DRAGGING_OFF_TARGET');
      }
    };

    const handleDocumentDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDocumentDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setDragState('IDLE');
    };

    const handleDocumentDragLeave = (e: DragEvent) => {
      if (e.clientX === 0 && e.clientY === 0) {
        dragCounterRef.current = 0;
        setDragState('IDLE');
      }
    };

    document.addEventListener('dragenter', handleDocumentDragEnter);
    document.addEventListener('dragover', handleDocumentDragOver);
    document.addEventListener('drop', handleDocumentDrop);
    document.addEventListener('dragleave', handleDocumentDragLeave);

    return () => {
      document.removeEventListener('dragenter', handleDocumentDragEnter);
      document.removeEventListener('dragover', handleDocumentDragOver);
      document.removeEventListener('drop', handleDocumentDrop);
      document.removeEventListener('dragleave', handleDocumentDragLeave);
    };
  }, [disabled, dragState]);

  const showOverlay = dragState !== 'IDLE' && dragState !== 'DROPPED';
  const isInvalid = dragState === 'DRAGGING_INVALID';

  return (
    <div className="relative">
      <div
        ref={targetRef}
        onDragEnter={handleTargetDragEnter}
        onDragLeave={handleTargetDragLeave}
        onDragOver={handleTargetDragOver}
        onDrop={handleTargetDrop}
      >
        {children}
      </div>

      <AnimatePresence>
        {showOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          >
            <div
              className={`rounded-2xl p-8 flex flex-col items-center gap-4 ${
                isInvalid
                  ? 'border-2 border-destructive bg-destructive/20'
                  : 'border-2 border-primary bg-primary/20'
              }`}
            >
              <FileUploadIcon className={isInvalid ? 'text-destructive' : 'text-primary'} />
              <p
                className={`text-lg font-medium ${isInvalid ? 'text-destructive' : 'text-primary'}`}
              >
                {isInvalid ? 'File type is not supported' : 'Drop image files here'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
