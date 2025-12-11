'use client';

/**
 * Fullscreen Modal Animation Wrapper
 *
 * Provides smooth entry/exit animations for fullscreen chart modals.
 * Uses Framer Motion AnimatePresence pattern for mount/unmount animations.
 *
 * Features:
 * - Animated backdrop (fade in/out)
 * - Animated modal container (fade + subtle scale)
 * - GPU-accelerated transforms (opacity, scale only)
 * - Reduced motion support (prefers-reduced-motion)
 * - Portal rendering to document.body
 */

import { motion } from 'framer-motion';
import { type ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Animation variants optimized for GPU (opacity + transform only)
const modalVariants = {
  initial: {
    opacity: 0,
    scale: 0.96,
  },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.2,
      ease: [0.25, 0.46, 0.45, 0.94], // Smooth easing
    },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    transition: {
      duration: 0.15,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
};

// Backdrop stays solid during exit to prevent flash when transitioning between charts
// Only fades in on initial mount, stays at full opacity during exit so the next modal's
// backdrop takes over seamlessly
const backdropVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.2 },
  },
  exit: {
    opacity: 1, // Stay solid during exit - prevents dashboard flash
    transition: { duration: 0 },
  },
};

// Reduced motion variants for accessibility
const reducedMotionVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.1 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
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
  const backdropVars = prefersReducedMotion ? reducedMotionVariants : backdropVariants;

  // Handle overlay click (only if clicking the overlay itself, not children)
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onOverlayClick();
    }
  };

  return createPortal(
    <>
      {/* Animated Backdrop */}
      <motion.div
        className="fixed inset-0 z-50 bg-black/80"
        variants={backdropVars}
        initial="initial"
        animate="animate"
        exit="exit"
        onClick={handleOverlayClick}
        aria-hidden="true"
      />
      {/* Animated Modal Container */}
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
      </motion.div>
    </>,
    document.body
  );
}
