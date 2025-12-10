'use client';

import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertIcon,
  CloseIcon,
  ALERT_VARIANT_STYLES,
  normalizeAlertType,
  type AlertType,
  type AlertVariant,
} from '@/components/ui/alert-shared';

// ============================================
// TYPES
// ============================================

export type ToastType = AlertType;
export type ToastVariant = AlertVariant;

export interface ToastProps {
  children: React.ReactNode;
  className?: string;
  /** Toast type - determines color scheme. Default: 'info' */
  type?: ToastType | '';
  /** Visual variant - solid (default), light, or outlined */
  variant?: ToastVariant;
  /** Whether the toast is visible */
  open: boolean;
  /** Callback to update visibility */
  setOpen: (open: boolean) => void;
  /** Auto-dismiss after duration (ms). 0 = no auto-dismiss. Default: 0 */
  duration?: number;
}

export interface ToastData {
  id: string;
  message: string;
  type: ToastType;
  variant?: ToastVariant;
  duration?: number;
}

export interface ToastContextType {
  toasts: ToastData[];
  showToast: (toast: Omit<ToastData, 'id'>) => void;
  dismissToast: (id: string) => void;
}

// Re-export for backward compatibility
/** @deprecated Use ToastData instead */
export type Toast = ToastData;

// ============================================
// TOAST COMPONENT (Controlled - Backward Compatible)
// ============================================

/**
 * Toast notification component with multiple visual variants.
 *
 * @example
 * // Basic usage (backward compatible)
 * <Toast type="success" open={showToast} setOpen={setShowToast}>
 *   Operation completed!
 * </Toast>
 *
 * @example
 * // With variant and auto-dismiss
 * <Toast
 *   type="success"
 *   variant="light"
 *   duration={3000}
 *   open={showToast}
 *   setOpen={setShowToast}
 * >
 *   Saved successfully!
 * </Toast>
 */
export default function Toast({
  children,
  className = '',
  type = '',
  variant = 'solid',
  open,
  setOpen,
  duration = 0,
}: ToastProps) {
  const normalizedType = normalizeAlertType(type);

  // Auto-dismiss effect with proper cleanup
  useEffect(() => {
    if (open && duration > 0) {
      const timer = setTimeout(() => setOpen(false), duration);
      return () => clearTimeout(timer);
    }
  }, [open, duration, setOpen]);

  if (!open) return null;

  const styles = ALERT_VARIANT_STYLES[variant];
  const bgColorClass = styles.colors[normalizedType];

  return (
    <div className={className} role="alert" aria-live="polite">
      <div
        className={`inline-flex min-w-[20rem] px-4 py-2 rounded-lg text-sm ${bgColorClass} ${styles.containerBase}`}
      >
        <div className="flex w-full justify-between items-start">
          <div className="flex">
            <AlertIcon type={normalizedType} variant={variant} />
            <div className={styles.fontWeight}>{children}</div>
          </div>
          <button
            type="button"
            className="opacity-60 hover:opacity-70 ml-3 mt-[3px]"
            onClick={() => setOpen(false)}
            aria-label="Dismiss notification"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// TOAST CONTEXT (Programmatic Usage)
// ============================================

const ToastContext = createContext<ToastContextType | undefined>(undefined);

/**
 * Toast Provider - wrap your app to enable useToast() hook.
 *
 * @example
 * // In layout.tsx
 * <ToastProvider>
 *   {children}
 * </ToastProvider>
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Cleanup all timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => {
        clearTimeout(timer);
      });
      timers.clear();
    };
  }, []);

  const dismissToast = useCallback((id: string) => {
    // Clear the timer if it exists
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (toast: Omit<ToastData, 'id'>) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const newToast: ToastData = {
        id,
        variant: 'solid',
        duration: 5000,
        ...toast,
      };

      setToasts((prev) => [...prev, newToast]);

      // Auto-dismiss with proper cleanup tracking
      if (newToast.duration && newToast.duration > 0) {
        const timer = setTimeout(() => {
          timersRef.current.delete(id);
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, newToast.duration);
        timersRef.current.set(id, timer);
      }
    },
    []
  );

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({ toasts, showToast, dismissToast }),
    [toasts, showToast, dismissToast]
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

/**
 * Hook to show toast notifications programmatically.
 *
 * @example
 * const { showToast } = useToast();
 *
 * const handleSave = async () => {
 *   try {
 *     await save();
 *     showToast({ message: 'Saved!', type: 'success' });
 *   } catch {
 *     showToast({ message: 'Failed to save', type: 'error' });
 *   }
 * };
 */
export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

// ============================================
// TOAST CONTAINER (Stacking & Positioning)
// ============================================

interface ToastContainerProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}

const ToastContainer = memo(function ToastContainer({
  toasts,
  onDismiss,
}: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 space-y-3 max-w-md"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
});

interface ToastItemProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

const ToastItem = memo(function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const [isExiting, setIsExiting] = useState(false);
  const variant = toast.variant || 'solid';
  const styles = ALERT_VARIANT_STYLES[variant];
  const bgColorClass = styles.colors[toast.type];

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    // Wait for animation to complete before removing
    setTimeout(() => onDismiss(toast.id), 300);
  }, [onDismiss, toast.id]);

  const animationClass = isExiting
    ? 'translate-x-full opacity-0'
    : 'translate-x-0 opacity-100';

  return (
    <div
      className={`inline-flex min-w-[20rem] px-4 py-2 rounded-lg text-sm transform transition-all duration-300 ${animationClass} ${bgColorClass} ${styles.containerBase}`}
      role="alert"
    >
      <div className="flex w-full justify-between items-start">
        <div className="flex">
          <AlertIcon type={toast.type} variant={variant} />
          <div className={styles.fontWeight}>{toast.message}</div>
        </div>
        <button
          type="button"
          className="opacity-60 hover:opacity-70 ml-3 mt-[3px]"
          onClick={handleDismiss}
          aria-label="Dismiss notification"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
});
