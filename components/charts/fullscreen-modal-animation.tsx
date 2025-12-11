'use client';

/**
 * Fullscreen Modal Animation Wrapper
 *
 * Provides smooth entry/exit animations for fullscreen chart modal CONTENT.
 * The backdrop is now handled separately by FullscreenBackdrop to prevent
 * flash/flicker during chart-to-chart navigation.
 *
 * Features:
 * - Fast animated modal container (fade + subtle scale)
 * - GPU-accelerated transforms (opacity, scale only)
 * - Reduced motion support (prefers-reduced-motion)
 * - Portal rendering to document.body
 */

import { motion } from 'framer-motion';
import { type ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Faster animation variants for snappy transitions
const modalVariants = {
  initial: {
    opacity: 0,
    scale: 0.98,
  },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.12,
      ease: 'easeOut',
    },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: {
      duration: 0.1,
      ease: 'easeIn',
    },
  },
};

// Reduced motion variants for accessibility
const reducedMotionVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.05 } },
  exit: { opacity: 0, transition: { duration: 0.05 } },
};

interface FullscreenModalAnimationProps {
  children: ReactNode;
  onOverlayClick: () => void;
  ariaLabelledBy: string;
}

export default function FullscreenModalAnimation({
  children,
  onOverlayClick,
  ariaLabelledBy,
}: FullscreenModalAnimationProps) {
  const [mounted, setMounted] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Check reduced motion preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Don't render on server or before client hydration
  if (!mounted) return null;

  const variants = prefersReducedMotion ? reducedMotionVariants : modalVariants;

  // Handle overlay click (only if clicking the overlay itself, not children)
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onOverlayClick();
    }
  };

  return createPortal(
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center sm:p-4"
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledBy}
    >
      {children}
    </motion.div>,
    document.body
  );
}
