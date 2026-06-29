import React, { useState } from 'react';

export function ImageShowButton({ src, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [showConfirm, setShowConfirm] = useState(false);

  if (!src || typeof src !== 'string') {
    return <img {...props} src={src} />;
  }

  const openImage = () => window.open(src, '_blank', 'noopener,noreferrer');

  return (
    <>
      <button
        onClick={(e) => {
          if (e.shiftKey || e.ctrlKey || e.metaKey) {
            openImage();
          } else {
            setShowConfirm(true);
          }
        }}
        className="bg-bg-300 border-border-300 font-ui text-text-300 inline-block grid h-32 w-40 items-center justify-items-center rounded-xl border p-4"
      >
        Show Image
      </button>
      {showConfirm && (
        <LinkConfirmationModal
          url={src}
          onClose={() => setShowConfirm(false)}
          onConfirm={() => {
            openImage();
            setShowConfirm(false);
          }}
        />
      )}
    </>
  );
}

function LinkConfirmationModal({
  url,
  onClose,
  onConfirm
}: {
  url: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-bg-100 rounded-lg p-6 max-w-md mx-4 shadow-xl border border-border-300"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-text-100 font-bold mb-2">Open external link?</h3>
        <p className="text-text-300 text-sm mb-4 break-all">{url}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md bg-bg-300 text-text-100 hover:bg-bg-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm rounded-md bg-accent-main-100 text-white hover:bg-accent-main-200"
          >
            Open
          </button>
        </div>
      </div>
    </div>
  );
}

function isRelativePath(href: string): boolean {
  if (href.startsWith('/') || href.startsWith('http://') || href.startsWith('https://'))
    return false;
  if (href.startsWith('./') || href.startsWith('../')) return true;
  try {
    new URL(href);
    return false;
  } catch {
    return /\.[a-zA-Z0-9]+$/.test(href) || href.includes('/');
  }
}

export function ConfirmableLink({
  href,
  className,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const [showConfirm, setShowConfirm] = useState(false);

  if (!href) return <a {...props}>{children}</a>;

  if (isRelativePath(href)) {
    return <span className={`underline ${className || ''}`}>{children}</span>;
  }

  const openLink = () => window.open(href, '_blank', 'noopener,noreferrer');

  return (
    <>
      <a
        className={`underline ${className || ''}`}
        onClick={(e) => {
          if (e.shiftKey || e.ctrlKey || e.metaKey) {
            e.preventDefault();
            openLink();
            return;
          }
          e.preventDefault();
          setShowConfirm(true);
        }}
        href={href}
        {...props}
      >
        {children}
      </a>
      {showConfirm && (
        <LinkConfirmationModal
          url={href}
          onClose={() => setShowConfirm(false)}
          onConfirm={() => {
            openLink();
            setShowConfirm(false);
          }}
        />
      )}
    </>
  );
}
