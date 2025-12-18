'use client';

import { forwardRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Badge color presets based on existing patterns.
 * Standardizes on /20 opacity for dark mode (most common pattern).
 */
const BADGE_COLORS = {
  gray: {
    bg: 'bg-gray-100 dark:bg-gray-900/20',
    text: 'text-gray-800 dark:text-gray-200',
    border: 'border-gray-200 dark:border-gray-700',
  },
  red: {
    bg: 'bg-red-100 dark:bg-red-900/20',
    text: 'text-red-800 dark:text-red-200',
    border: 'border-red-200 dark:border-red-700',
  },
  orange: {
    bg: 'bg-orange-100 dark:bg-orange-900/20',
    text: 'text-orange-800 dark:text-orange-200',
    border: 'border-orange-200 dark:border-orange-700',
  },
  yellow: {
    bg: 'bg-yellow-100 dark:bg-yellow-900/20',
    text: 'text-yellow-800 dark:text-yellow-200',
    border: 'border-yellow-200 dark:border-yellow-700',
  },
  green: {
    bg: 'bg-green-100 dark:bg-green-900/20',
    text: 'text-green-800 dark:text-green-200',
    border: 'border-green-200 dark:border-green-700',
  },
  blue: {
    bg: 'bg-blue-100 dark:bg-blue-900/20',
    text: 'text-blue-800 dark:text-blue-200',
    border: 'border-blue-200 dark:border-blue-700',
  },
  indigo: {
    bg: 'bg-indigo-100 dark:bg-indigo-900/20',
    text: 'text-indigo-800 dark:text-indigo-200',
    border: 'border-indigo-200 dark:border-indigo-700',
  },
  purple: {
    bg: 'bg-purple-100 dark:bg-purple-900/20',
    text: 'text-purple-800 dark:text-purple-200',
    border: 'border-purple-200 dark:border-purple-700',
  },
  violet: {
    bg: 'bg-violet-100 dark:bg-violet-900/20',
    text: 'text-violet-800 dark:text-violet-200',
    border: 'border-violet-200 dark:border-violet-700',
  },
  teal: {
    bg: 'bg-teal-100 dark:bg-teal-900/20',
    text: 'text-teal-800 dark:text-teal-200',
    border: 'border-teal-200 dark:border-teal-700',
  },
  amber: {
    bg: 'bg-amber-100 dark:bg-amber-900/20',
    text: 'text-amber-800 dark:text-amber-200',
    border: 'border-amber-200 dark:border-amber-700',
  },
} as const;

type BadgeColor = keyof typeof BADGE_COLORS;

/**
 * Badge size presets.
 * - sm: Compact, inline use (admin panels, tables)
 * - md: Standard (most badges) - DEFAULT
 * - lg: Prominent display
 */
const BADGE_SIZES = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-0.5 text-xs',
  lg: 'px-3 py-1 text-sm',
} as const;

type BadgeSize = keyof typeof BADGE_SIZES;

/**
 * Badge variant presets.
 * - filled: Solid background (default)
 * - outlined: Border with subtle background
 */
const BADGE_VARIANTS = {
  filled: '',
  outlined: 'border',
} as const;

type BadgeVariant = keyof typeof BADGE_VARIANTS;

/**
 * Badge shape presets.
 * - pill: Fully rounded (default, most badges)
 * - rounded: Slightly rounded corners (admin panels)
 */
const BADGE_SHAPES = {
  pill: 'rounded-full',
  rounded: 'rounded',
} as const;

type BadgeShape = keyof typeof BADGE_SHAPES;

interface BadgeProps {
  /** Badge content */
  children: ReactNode;
  /** Color scheme */
  color?: BadgeColor;
  /** Size preset */
  size?: BadgeSize;
  /** Variant style */
  variant?: BadgeVariant;
  /** Shape style */
  shape?: BadgeShape;
  /** Optional icon (left side) */
  icon?: ReactNode;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Badge component for status indicators, labels, and counts.
 *
 * @example
 * // Basic usage
 * <Badge color="green">Active</Badge>
 *
 * @example
 * // With size and variant
 * <Badge color="red" size="sm" variant="outlined">Critical</Badge>
 *
 * @example
 * // With icon
 * <Badge color="blue" icon={<CheckIcon className="w-3 h-3" />}>Completed</Badge>
 */
const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      children,
      color = 'gray',
      size = 'md',
      variant = 'filled',
      shape = 'pill',
      icon,
      className,
    },
    ref
  ) => {
    const colorClasses = BADGE_COLORS[color];
    const sizeClasses = BADGE_SIZES[size];
    const variantClasses = BADGE_VARIANTS[variant];
    const shapeClasses = BADGE_SHAPES[shape];

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center font-medium',
          sizeClasses,
          shapeClasses,
          colorClasses.bg,
          colorClasses.text,
          variant === 'outlined' && colorClasses.border,
          variantClasses,
          className
        )}
      >
        {icon && <span className="mr-1">{icon}</span>}
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

export { Badge, BADGE_COLORS, BADGE_SIZES };
export type { BadgeColor, BadgeSize, BadgeVariant, BadgeShape, BadgeProps };
