import { extractBase64FromDataUrl } from '../../../mcpServersStore';

export interface Attachment {
  id: string;
  file: File;
  base64: string;
  url: string;
  error?: string;
  isAnnotated?: boolean;
}

export const MAX_IMAGE_DIMENSION = 8000;
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

export async function fileToBase64(file: File): Promise<string> {
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

export async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
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

export async function compressImage(file: File, targetSize: number): Promise<File> {
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

export function validateFile(file: File): string | null {
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
