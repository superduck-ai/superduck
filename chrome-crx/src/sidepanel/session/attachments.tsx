import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { extractBase64FromDataUrl } from '../../mcpServersStore';

export interface Attachment {
  id: string;
  file: File;
  base64: string;
  url: string;
  error?: string;
  isAnnotated?: boolean;
}

const MAX_IMAGE_DIMENSION = 8000;
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/jpg'];
const SUPPORTED_DOCUMENT_TYPES = ['application/pdf'];
const SUPPORTED_FILE_TYPES = [...SUPPORTED_IMAGE_TYPES, ...SUPPORTED_DOCUMENT_TYPES];

export function isSupportedImageType(type: string): boolean {
  return SUPPORTED_IMAGE_TYPES.includes(type);
}

export function isSupportedFileType(type: string): boolean {
  return SUPPORTED_FILE_TYPES.includes(type);
}

export function isImageFile(type: string): boolean {
  return type.startsWith('image/');
}

export function isPdfFile(type: string): boolean {
  return type === 'application/pdf';
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Failed to read file as data URL'));
        return;
      }
      const dataUrl = reader.result;
      const base64 = extractBase64FromDataUrl(dataUrl);
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

async function compressImage(file: File, targetSize: number): Promise<File> {
  const img = new Image();
  const url = URL.createObjectURL(file);

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = url;
  });

  URL.revokeObjectURL(url);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');

  const scale = Math.min(1, targetSize / Math.max(img.width, img.height));
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  let quality = 0.9;
  let blob: Blob | null = null;

  for (let i = 0; i < 5; i++) {
    blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, file.type, quality);
    });

    if (!blob) break;
    if (blob.size <= 3 * 1024 * 1024) break;
    quality *= 0.8;
  }

  if (!blob) throw new Error('Failed to compress image');

  return new File([blob], file.name, { type: file.type });
}

function validateFile(file: File): string | null {
  if (!isSupportedFileType(file.type)) {
    return 'File type is not supported. Please upload an image (PNG, JPG, GIF, WebP) or PDF file.';
  }

  const maxSize = isPdfFile(file.type) ? 32 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > maxSize) {
    const limitMB = isPdfFile(file.type) ? 32 : 10;
    return `File size exceeds ${limitMB}MB limit.`;
  }

  return null;
}

export function useAttachments() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(async (files: File[] | FileList) => {
    console.log('[DEBUG] handleFiles called with:', files);
    const fileArray = Array.from(files).filter((file) =>
      isImageFile(file.type) || isPdfFile(file.type)
    );
    console.log('[DEBUG] Filtered files:', fileArray);
    if (fileArray.length === 0) return;

    setIsUploading(true);
    setUploadingCount(fileArray.length);
    setError(null);

    await new Promise((resolve) => setTimeout(resolve, 800));

    const newAttachments: Attachment[] = [];

    for (const file of fileArray) {
      try {
        const validationError = validateFile(file);
        if (validationError) {
          newAttachments.push({
            id: crypto.randomUUID(),
            file,
            base64: '',
            url: '',
            error: validationError
          });
          continue;
        }

        if (isPdfFile(file.type)) {
          const base64 = await fileToBase64(file);
          const url = URL.createObjectURL(file);

          newAttachments.push({
            id: crypto.randomUUID(),
            file,
            base64,
            url
          });
          continue;
        }

        const dimensions = await getImageDimensions(file);
        let processedFile = file;

        const needsCompression =
          dimensions.width > MAX_IMAGE_DIMENSION ||
          dimensions.height > MAX_IMAGE_DIMENSION ||
          (file.size > 3 * 1024 * 1024 &&
            (file.type === 'image/jpeg' || file.type === 'image/png'));

        if (needsCompression) {
          if (file.type === 'image/jpeg' || file.type === 'image/png') {
            processedFile = await compressImage(file, MAX_IMAGE_DIMENSION);
          } else if (
            dimensions.width > MAX_IMAGE_DIMENSION ||
            dimensions.height > MAX_IMAGE_DIMENSION
          ) {
            newAttachments.push({
              id: crypto.randomUUID(),
              file,
              base64: '',
              url: '',
              error: `Image dimensions exceed ${MAX_IMAGE_DIMENSION}px limit and cannot be compressed.`
            });
            continue;
          }
        }

        const base64 = await fileToBase64(processedFile);
        const url = URL.createObjectURL(processedFile);

        newAttachments.push({
          id: crypto.randomUUID(),
          file: processedFile,
          base64,
          url
        });
      } catch (err) {
        newAttachments.push({
          id: crypto.randomUUID(),
          file,
          base64: '',
          url: '',
          error: err instanceof Error ? err.message : 'Failed to process file'
        });
      }
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
    setIsUploading(false);
    setUploadingCount(0);

    const hasError = newAttachments.some((a) => a.error);
    if (hasError) {
      setTimeout(() => setError(null), 3000);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      void handleFiles(files);
    },
    [handleFiles]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData.items);
      const imageFiles = items
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);

      if (imageFiles.length > 0) {
        e.preventDefault();
        void handleFiles(imageFiles);
      }
    },
    [handleFiles]
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const attachment = prev.find((a) => a.id === id);
      if (attachment?.url) {
        URL.revokeObjectURL(attachment.url);
      }
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const clearAttachments = useCallback(() => {
    attachments.forEach((attachment) => {
      if (attachment.url) {
        URL.revokeObjectURL(attachment.url);
      }
    });
    setAttachments([]);
  }, [attachments]);

  const addAttachment = useCallback((attachment: Attachment) => {
    setAttachments((prev) => [...prev, attachment]);
  }, []);

  return {
    attachments,
    isUploading,
    uploadingCount,
    error,
    handleFiles,
    handleDrop,
    handlePaste,
    removeAttachment,
    clearAttachments,
    addAttachment
  };
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-3 bg-bg-200 rounded w-3/4"></div>
      <div className="h-3 bg-bg-200 rounded w-1/2"></div>
    </div>
  );
}

interface AttachmentThumbnailProps {
  attachment: Attachment;
  onRemove: (id: string) => void;
  isLoading?: boolean;
}

function AttachmentThumbnail({ attachment, onRemove, isLoading }: AttachmentThumbnailProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  if (attachment.error) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="relative w-[120px] h-[120px] rounded-lg border-2 border-red-500 bg-bg-100 p-2 flex flex-col items-center justify-center"
      >
        <div className="text-red-500 mb-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p className="text-xs text-red-500 text-center line-clamp-2">{attachment.error}</p>
        <button
          onClick={() => onRemove(attachment.id)}
          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="2" y1="2" x2="10" y2="10" />
            <line x1="10" y1="2" x2="2" y2="10" />
          </svg>
        </button>
      </motion.div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-[120px] h-[120px] rounded-lg border border-border-300 bg-bg-100 p-3">
        <Skeleton />
      </div>
    );
  }

  if (attachment.url && isImageFile(attachment.file.type)) {
    return (
      <>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="relative w-[120px] h-[120px] rounded-lg overflow-hidden border border-border-300 cursor-pointer"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={() => setShowPreview(true)}
        >
          <img src={attachment.url} alt={attachment.file.name} className="w-full h-full object-cover" />
          {isHovered && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(attachment.id);
              }}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="2" y1="2" x2="10" y2="10" />
                <line x1="10" y1="2" x2="2" y2="10" />
              </svg>
            </motion.button>
          )}
        </motion.div>

        {showPreview && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setShowPreview(false)}
          >
            <img
              src={attachment.url}
              alt={attachment.file.name}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </>
    );
  }

  if (attachment.url) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="relative w-[120px] h-[120px] rounded-lg border border-border-300 bg-bg-100 p-3 flex flex-col items-center justify-center"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="16" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
        <p className="text-xs text-text-200 mt-2 text-center line-clamp-2">{attachment.file.name}</p>
        <p className="text-xs text-text-300 mt-1">
          {attachment.file.size > 1024 * 1024
            ? `${(attachment.file.size / (1024 * 1024)).toFixed(1)} MB`
            : `${(attachment.file.size / 1024).toFixed(1)} KB`}
        </p>
        {isHovered && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => onRemove(attachment.id)}
            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="2" y1="2" x2="10" y2="10" />
              <line x1="10" y1="2" x2="2" y2="10" />
            </svg>
          </motion.button>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="relative w-[120px] h-[120px] rounded-lg border border-border-300 bg-bg-100 p-3 flex flex-col items-center justify-center"
    >
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <p className="text-xs text-text-200 mt-2 text-center line-clamp-2">{attachment.file.name}</p>
      <p className="text-xs text-text-300 mt-1">
        {attachment.file.size > 1024 * 1024
          ? `${(attachment.file.size / (1024 * 1024)).toFixed(1)} MB`
          : `${(attachment.file.size / 1024).toFixed(1)} KB`}
      </p>
      <button
        onClick={() => onRemove(attachment.id)}
        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-bg-300 text-text-200 flex items-center justify-center hover:bg-bg-400 transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="2" y1="2" x2="10" y2="10" />
          <line x1="10" y1="2" x2="2" y2="10" />
        </svg>
      </button>
    </motion.div>
  );
}

interface AttachmentThumbnailsProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
  isUploading: boolean;
  uploadingCount: number;
}

export function AttachmentThumbnails({
  attachments,
  onRemove,
  isUploading,
  uploadingCount
}: AttachmentThumbnailsProps) {
  console.log('[DEBUG] AttachmentThumbnails render:', { attachments, isUploading, uploadingCount });
  const hasContent = attachments.length > 0 || isUploading;

  return (
    <AnimatePresence>
      {hasContent && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="border-t border-border-300/25 rounded-b-2xl bg-bg-100 overflow-hidden"
        >
          <div className="flex flex-row overflow-x-auto overflow-y-hidden gap-3 px-3.5 py-2.5">
            <AnimatePresence mode="popLayout">
              {attachments.map((attachment) => (
                <motion.div
                  key={attachment.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                >
                  <AttachmentThumbnail attachment={attachment} onRemove={onRemove} />
                </motion.div>
              ))}
              {isUploading &&
                Array.from({ length: uploadingCount }).map((_, i) => (
                  <motion.div
                    key={`loading-${i}`}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="w-[120px] h-[120px] rounded-lg border border-border-300 bg-bg-100 p-3">
                      <Skeleton />
                    </div>
                  </motion.div>
                ))}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

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
                  ? 'bg-red-500/20 border-2 border-red-500'
                  : 'bg-blue-500/20 border-2 border-blue-500'
              }`}
            >
              <FileUploadIcon className={isInvalid ? 'text-red-500' : 'text-blue-500'} />
              <p className={`text-lg font-medium ${isInvalid ? 'text-red-500' : 'text-blue-500'}`}>
                {isInvalid ? 'File type is not supported' : 'Drop image files here'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
