'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  getTransitionVariants,
  reducedMotionVariants,
  type TransitionVariant,
} from '@/lib/animations/transitions';

/**
 * PageTransition Component
 *
 * CSP-compliant page transition wrapper using Framer Motion
 * Automatically detects prefers-reduced-motion for accessibility
 *
 * Usage:
 * ```tsx
 * <PageTransition variant="fade">
 *   {children}
 * </PageTransition>
 * ```
 */

interface PageTransitionProps {
  children: React.ReactNode;
  variant?: TransitionVariant;
  className?: string;
}

export default function PageTransition({
  children,
  variant = 'fade',
  className = '',
}: PageTransitionProps) {
  const pathname = usePathname();
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Detect prefers-reduced-motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Use reduced motion variants if user prefers
  const variants = prefersReducedMotion
    ? reducedMotionVariants
    : getTransitionVariants(variant);

  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={variants}
      className={className}
    >
      {children}
    </motion.div>
  );
}
