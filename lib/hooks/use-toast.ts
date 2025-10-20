import { useState } from 'react';

export type ToastType = 'success' | 'error' | 'warning';

interface ToastState {
  show: boolean;
  message: string;
  type: ToastType;
}

interface UseToastReturn {
  toast: ToastState;
  showToast: (type: ToastType, message: string) => void;
  hideToast: () => void;
  setToastOpen: (open: boolean) => void;
}

/**
 * Simple toast notification hook
 * Manages toast state (show/hide, message, type)
 */
export function useToast(): UseToastReturn {
  const [toast, setToast] = useState<ToastState>({
    show: false,
    message: '',
    type: 'success',
  });

  const showToast = (type: ToastType, message: string) => {
    setToast({ show: true, message, type });
  };

  const hideToast = () => {
    setToast((prev) => ({ ...prev, show: false }));
  };

  const setToastOpen = (open: boolean) => {
    setToast((prev) => ({ ...prev, show: open }));
  };

  return {
    toast,
    showToast,
    hideToast,
    setToastOpen,
  };
}
