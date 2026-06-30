import { useState, useEffect } from 'react';
import { cn, CircleCheckIcon, CloseIcon } from '../ui';

export interface ToastData {
  id: string;
  message: string;
  type: 'success' | 'error';
}

declare global {
  interface Window {
    showToast?: (message: string, type?: 'success' | 'error') => void;
  }
}

function ToastItem({ toast, onClose }: { toast: ToastData; onClose: (id: string) => void }) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleClose();
    }, 3000);
    return () => clearTimeout(timer);
  }, [toast.id]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      onClose(toast.id);
    }, 200);
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg',
        'bg-bg-000 border-[0.5px] border-border-300',
        'min-w-[300px] transition-all duration-200 ease-out',
        isExiting
          ? ['opacity-0 translate-x-full']
          : ['animate-toast-slide-in', 'opacity-100 translate-x-0']
      )}
      style={{ animation: isExiting ? undefined : 'toast-slide-in 0.3s ease-out' }}
    >
      {toast.type === 'success' && (
        <CircleCheckIcon size={16} className="text-accent-secondary-100 flex-shrink-0" />
      )}
      <p className="text-text-200 font-base flex-1">{toast.message}</p>
      <button
        onClick={handleClose}
        className="p-1 hover:bg-bg-100 rounded transition-colors flex-shrink-0"
      >
        <CloseIcon size={14} className="text-text-300" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    window.showToast = addToast;
    return () => {
      delete window.showToast;
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onClose={removeToast} />
      ))}
    </div>
  );
}

export function useToast() {
  return {
    showToast: (message: string, type: 'success' | 'error' = 'success') => {
      if (window.showToast) window.showToast(message, type);
    }
  };
}
