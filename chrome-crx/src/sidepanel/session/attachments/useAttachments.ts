import React, { useCallback, useState } from 'react';
import type { Attachment } from './fileUtils';
import {
  isImageFile,
  isPdfFile,
  validateFile,
  fileToBase64,
  getImageDimensions,
  compressImage,
  MAX_IMAGE_DIMENSION
} from './fileUtils';

export function useAttachments() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(async (files: File[] | FileList) => {
    const fileArray = Array.from(files).filter(
      (file) => isImageFile(file.type) || isPdfFile(file.type)
    );
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
