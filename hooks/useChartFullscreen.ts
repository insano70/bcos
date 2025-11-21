/**
 * useChartFullscreen Hook
 *
 * Manages fullscreen modal lifecycle:
 * - Client-side mounting for portal rendering
 * - Body scroll locking when modal is open
 * - Escape key handling to close modal
 *
 * Single Responsibility: Modal lifecycle management only
 */

import { useEffect, useState } from 'react';

/**
 * Manages fullscreen modal lifecycle and interactions
 *
 * @param isOpen - Whether the modal is currently open
 * @param onClose - Callback to close the modal
 * @returns Object containing mounted state
 */
export function useChartFullscreen(isOpen: boolean, onClose: () => void) {
  const [mounted, setMounted] = useState(false);

  // Handle client-side mounting for portal rendering
  // This ensures the portal only renders after hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  return { mounted };
}
