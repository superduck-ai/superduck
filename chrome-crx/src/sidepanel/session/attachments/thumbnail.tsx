import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { type Attachment, isImageFile } from './fileUtils';

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
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
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
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
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
          <img
            src={attachment.url}
            alt={attachment.file.name}
            className="w-full h-full object-cover"
          />
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
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
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
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="16" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
        <p className="text-xs text-text-200 mt-2 text-center line-clamp-2">
          {attachment.file.name}
        </p>
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
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
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
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
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
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
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
