import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-react';
import { MemoizedFormattedMessage, useIntlSafe } from '../index-react-dom-intl';

export function ConversationSummary({ message }: { message: any }) {
  const [expanded, setExpanded] = useState(false);
  const summaryText = typeof message.content === 'string' ? message.content : '';

  return (
    <div className="mb-5 overflow-hidden border-[0.5px] border-border-200 rounded-[10px]">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full px-4 py-2 transition-colors flex items-center justify-between text-left cursor-pointer ${expanded ? 'bg-bg-000' : 'bg-bg-100 hover:bg-bg-200'}`}
      >
        <span className="font-small text-text-300">
          <MemoizedFormattedMessage
            defaultMessage="Conversation summary"
            id="conversation_summary"
          />
        </span>
        <ChevronRight
          className={`w-4 h-4 text-text-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </button>
      {expanded && (
        <div className="px-4 pt-2 pb-4 bg-bg-000">
          <div className="font-superduck-response text-xs text-text-200 whitespace-pre-wrap">
            {summaryText}
          </div>
        </div>
      )}
    </div>
  );
}

export function ImagePreviewModal({
  imageUrl,
  onClose
}: {
  imageUrl: string | null;
  onClose: () => void;
}) {
  const intl = useIntlSafe();

  useEffect(() => {
    if (!imageUrl) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [imageUrl, onClose]);

  if (!imageUrl) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 cursor-pointer"
      onClick={onClose}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh]"
        onClick={(event) => event.stopPropagation()}
      >
        <img
          src={imageUrl}
          alt="Preview"
          className="max-w-full max-h-[90vh] object-contain rounded-lg"
        />
        <button
          type="button"
          onClick={onClose}
          className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          aria-label={intl.formatMessage({ defaultMessage: 'Close preview', id: 'close_preview' })}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3];

export function ScreenshotLightbox({
  imageUrl,
  onClose
}: {
  imageUrl: string;
  onClose: () => void;
}) {
  const intl = useIntlSafe();
  const [zoomIndex, setZoomIndex] = useState(2);
  const overlayRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  const zoom = ZOOM_STEPS[zoomIndex];
  const canZoomOut = zoomIndex > 0;
  const canZoomIn = zoomIndex < ZOOM_STEPS.length - 1;

  const zoomIn = useCallback(() => {
    setZoomIndex((index) => Math.min(index + 1, ZOOM_STEPS.length - 1));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomIndex((index) => Math.max(index - 1, 0));
  }, []);

  useEffect(() => {
    setTranslate({ x: 0, y: 0 });
  }, [zoomIndex]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    const element = overlayRef.current;
    if (!element) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.deltaY < 0) {
        setZoomIndex((index) => Math.min(index + 1, ZOOM_STEPS.length - 1));
      } else if (event.deltaY > 0) {
        setZoomIndex((index) => Math.max(index - 1, 0));
      }
    };
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      setIsDragging(true);
      dragStart.current = {
        x: event.clientX,
        y: event.clientY,
        tx: translate.x,
        ty: translate.y
      };
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    },
    [translate]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!isDragging) return;
      const dx = event.clientX - dragStart.current.x;
      const dy = event.clientY - dragStart.current.y;
      setTranslate({ x: dragStart.current.tx + dx, y: dragStart.current.ty + dy });
    },
    [isDragging]
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-[60] flex flex-col"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
    >
      <div className="shrink-0 flex items-center justify-end px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={zoomOut}
            disabled={!canZoomOut}
            className="p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label={intl.formatMessage({
              defaultMessage: 'Zoom out',
              id: 'screenshot_zoom_out'
            })}
          >
            <ZoomOut size={16} />
          </button>
          <span className="text-white/90 text-xs font-medium select-none min-w-[36px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={zoomIn}
            disabled={!canZoomIn}
            className="p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label={intl.formatMessage({
              defaultMessage: 'Zoom in',
              id: 'screenshot_zoom_in'
            })}
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors ml-2"
            aria-label={intl.formatMessage({ defaultMessage: 'Close preview', id: 'close_preview' })}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div
        className="flex-1 min-h-0 overflow-hidden flex items-center justify-center p-4 select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ touchAction: 'none' }}
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt="Screenshot preview"
          className="max-w-full max-h-full object-contain rounded-lg"
          draggable={false}
          onClick={(event) => event.stopPropagation()}
          style={{
            transform: `scale(${zoom}) translate(${translate.x / zoom}px, ${translate.y / zoom}px)`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.2s ease'
          }}
        />
      </div>
    </div>
  );
}
