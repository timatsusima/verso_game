'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export interface DuelToast {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'danger';
  duration?: number;
}

interface DuelToastsProps {
  toasts: DuelToast[];
  onRemove: (id: string) => void;
}

export function DuelToasts({ toasts, onRemove }: DuelToastsProps) {
  return (
    <div className="fixed top-20 left-0 right-0 z-40 flex flex-col items-center gap-2 px-4 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onRemove }: { toast: DuelToast; onRemove: (id: string) => void }) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const duration = toast.duration || 2500;
    
    const exitTimer = setTimeout(() => {
      setIsExiting(true);
    }, duration - 300);

    const removeTimer = setTimeout(() => {
      onRemove(toast.id);
    }, duration);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(removeTimer);
    };
  }, [toast.id, toast.duration, onRemove]);

  const bgColor = {
    info: 'bg-blue-500/90',
    warning: 'bg-orange-500/90',
    danger: 'bg-red-500/90',
  }[toast.type];

  return (
    <div
      className={cn(
        'px-4 py-2 rounded-full font-semibold text-white shadow-lg backdrop-blur-sm',
        'transform transition-all duration-300',
        bgColor,
        isExiting ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0 animate-bounce-in'
      )}
    >
      {toast.message}
    </div>
  );
}

// Hook for managing toasts
export function useDuelToasts() {
  const [toasts, setToasts] = useState<DuelToast[]>([]);

  const addToast = (message: string, type: DuelToast['type'] = 'info', duration = 2500) => {
    const id = `${Date.now()}-${Math.random()}`;
    
    setToasts((prev) => {
      // Prevent duplicate messages and limit to max 2 toasts
      if (prev.some(t => t.message === message)) {
        return prev;
      }
      const newToasts = [...prev, { id, message, type, duration }];
      // Keep only last 2 toasts
      return newToasts.slice(-2);
    });
    
    // Vibrate on warning/danger toasts
    if ((type === 'warning' || type === 'danger') && typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(type === 'danger' ? [50, 30, 50] : 30);
    }
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const clearToasts = () => {
    setToasts([]);
  };

  return { toasts, addToast, removeToast, clearToasts };
}
