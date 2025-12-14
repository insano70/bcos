'use client';

/**
 * Fullscreen Backdrop
 *
 * A single persistent backdrop that lives outside AnimatePresence.
 * This prevents the flash/flicker that occurs when two modals
 * with their own backdrops fight for z-index during transitions.
 *
 * The backdrop only animates on true open/close, not during
 * chart-to-chart navigation within fullscreen mode.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';

interface FullscreenBackdropProps {
  isVisible: boolean;
  onClose: () => void;
}

const backdropVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
};

export default function FullscreenBackdrop({ isVisible, onClose }: FullscreenBackdropProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render on server or before client hydration
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-40 bg-black"
          variants={backdropVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
    </AnimatePresence>,
    document.body
  );
}
