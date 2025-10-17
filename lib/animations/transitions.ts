/**
 * Framer Motion Animation Variants Library
 *
 * CSP-compliant animation presets for page transitions
 * All animations use transform and opacity (GPU accelerated)
 * Respects prefers-reduced-motion for accessibility
 */

import type { Variants } from 'framer-motion';

/**
 * Animation timing configuration
 */
export const TRANSITION_DURATION = 0.3; // Quick transition for snappy feel (template.tsx only does entry, not exit)
export const TRANSITION_EASE: [number, number, number, number] = [0.43, 0.13, 0.23, 0.96]; // Custom easing curve (cubic-bezier)

/**
 * Base transition configuration
 */
export const baseTransition = {
  duration: TRANSITION_DURATION,
  ease: TRANSITION_EASE,
};

/**
 * FADE - Simple opacity fade
 * Best for: General page transitions, minimal distraction
 */
export const fadeVariants: Variants = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
    transition: baseTransition,
  },
  exit: {
    opacity: 0,
    transition: baseTransition,
  },
};

/**
 * SLIDE - Horizontal slide animation
 * Best for: Dashboard navigation, sequential flows
 */
export const slideVariants: Variants = {
  initial: {
    opacity: 0,
    x: 20,
  },
  animate: {
    opacity: 1,
    x: 0,
    transition: baseTransition,
  },
  exit: {
    opacity: 0,
    x: -20,
    transition: baseTransition,
  },
};

/**
 * SLIDE UP - Vertical slide from bottom
 * Best for: Modal-like pages, content reveals
 */
export const slideUpVariants: Variants = {
  initial: {
    opacity: 0,
    y: 20,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: baseTransition,
  },
  exit: {
    opacity: 0,
    y: -20,
    transition: baseTransition,
  },
};

/**
 * SCALE - Zoom scale animation
 * Best for: Onboarding flows, detail pages
 */
export const scaleVariants: Variants = {
  initial: {
    opacity: 0,
    scale: 0.95,
  },
  animate: {
    opacity: 1,
    scale: 1,
    transition: baseTransition,
  },
  exit: {
    opacity: 0,
    scale: 1.05,
    transition: baseTransition,
  },
};

/**
 * BLUR FADE - Fade with blur effect
 * Best for: Authentication pages, focus transitions
 */
export const blurFadeVariants: Variants = {
  initial: {
    opacity: 0,
    filter: 'blur(10px)',
  },
  animate: {
    opacity: 1,
    filter: 'blur(0px)',
    transition: baseTransition,
  },
  exit: {
    opacity: 0,
    filter: 'blur(10px)',
    transition: baseTransition,
  },
};

/**
 * ROTATION FADE - Subtle rotation with fade
 * Best for: Creative transitions, special sections
 */
export const rotationFadeVariants: Variants = {
  initial: {
    opacity: 0,
    rotate: -2,
    scale: 0.98,
  },
  animate: {
    opacity: 1,
    rotate: 0,
    scale: 1,
    transition: baseTransition,
  },
  exit: {
    opacity: 0,
    rotate: 2,
    scale: 0.98,
    transition: baseTransition,
  },
};

/**
 * Get transition variant by name
 */
export type TransitionVariant =
  | 'fade'
  | 'slide'
  | 'slideUp'
  | 'scale'
  | 'blurFade'
  | 'rotationFade';

export const getTransitionVariants = (variant: TransitionVariant = 'fade'): Variants => {
  const variants = {
    fade: fadeVariants,
    slide: slideVariants,
    slideUp: slideUpVariants,
    scale: scaleVariants,
    blurFade: blurFadeVariants,
    rotationFade: rotationFadeVariants,
  };

  return variants[variant] || fadeVariants;
};

/**
 * Reduced motion variants (accessibility)
 * When user has prefers-reduced-motion enabled
 */
export const reducedMotionVariants: Variants = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
    transition: {
      duration: 0.15,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.15,
    },
  },
};
