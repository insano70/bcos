'use client';

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Variant presets for the Card component.
 * Uses gray palette consistently (app standard).
 */
const CARD_VARIANTS = {
  /** Default - Admin panels, configuration sections */
  default: {
    background: 'bg-white dark:bg-gray-800',
    border: 'border border-gray-200 dark:border-gray-700',
  },
  /** Elevated - Cards with more visual emphasis */
  elevated: {
    background: 'bg-white dark:bg-gray-800',
    border: 'border border-gray-200 dark:border-gray-700',
  },
} as const;

export type CardVariant = keyof typeof CARD_VARIANTS;

/**
 * Padding presets for the Card component.
 */
const CARD_PADDING = {
  /** No padding - content controls its own spacing */
  none: '',
  /** Small - p-4 */
  sm: 'p-4',
  /** Medium - p-6 (default) */
  md: 'p-6',
  /** Large - p-8 */
  lg: 'p-8',
} as const;

export type CardPadding = keyof typeof CARD_PADDING;

/**
 * Border radius presets for the Card component.
 */
const CARD_RADIUS = {
  /** Standard - rounded-lg */
  lg: 'rounded-lg',
  /** Medium elevation - rounded-xl (default for admin panels) */
  xl: 'rounded-xl',
  /** High elevation - rounded-2xl (report cards) */
  '2xl': 'rounded-2xl',
} as const;

export type CardRadius = keyof typeof CARD_RADIUS;

/**
 * Shadow presets for the Card component.
 */
const CARD_SHADOW = {
  /** No shadow */
  none: '',
  /** Light shadow - shadow-sm (default for admin panels) */
  sm: 'shadow-sm',
  /** Medium shadow */
  md: 'shadow-md',
  /** Large shadow */
  lg: 'shadow-lg',
} as const;

export type CardShadow = keyof typeof CARD_SHADOW;

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Visual style variant.
   * - `default`: Standard card styling
   * - `elevated`: Cards with more visual emphasis
   * @default 'default'
   */
  variant?: CardVariant;

  /**
   * Padding preset.
   * - `none`: No padding
   * - `sm`: p-4
   * - `md`: p-6 (default)
   * - `lg`: p-8
   * @default 'md'
   */
  padding?: CardPadding;

  /**
   * Border radius preset.
   * - `lg`: rounded-lg (compact cards)
   * - `xl`: rounded-xl (default)
   * - `2xl`: rounded-2xl (larger cards)
   * @default 'xl'
   */
  radius?: CardRadius;

  /**
   * Shadow preset.
   * - `none`: No shadow
   * - `sm`: shadow-sm (default)
   * - `md`: shadow-md
   * - `lg`: shadow-lg
   * @default 'sm'
   */
  shadow?: CardShadow;

  children: ReactNode;
}

/**
 * Card component for consistent panel/card styling across the application.
 *
 * @example
 * // Basic admin panel
 * <Card>
 *   <h3>Panel Title</h3>
 *   <p>Content</p>
 * </Card>
 *
 * @example
 * // Compact stat box
 * <Card radius="lg" shadow="none" padding="sm">
 *   <div className="text-xs">Data Sources</div>
 *   <div className="text-2xl font-bold">{count}</div>
 * </Card>
 *
 * @example
 * // Configuration section
 * <Card padding="md">
 *   <h2 className="text-xl font-semibold mb-6">Settings</h2>
 *   <form>...</form>
 * </Card>
 */
const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = 'default',
      padding = 'md',
      radius = 'xl',
      shadow = 'sm',
      className,
      children,
      ...props
    },
    ref
  ) => {
    const variantStyles = CARD_VARIANTS[variant];

    return (
      <div
        ref={ref}
        className={cn(
          variantStyles.background,
          variantStyles.border,
          CARD_RADIUS[radius],
          CARD_SHADOW[shadow],
          CARD_PADDING[padding],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

/**
 * Card header subcomponent for cards with header/content separation.
 */
interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700', className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardHeader.displayName = 'CardHeader';

/**
 * Card content subcomponent for the main content area.
 */
interface CardContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('p-4 sm:p-6', className)} {...props}>
        {children}
      </div>
    );
  }
);

CardContent.displayName = 'CardContent';

/**
 * Card footer subcomponent for cards with footer actions.
 */
interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('p-4 sm:p-6 border-t border-gray-200 dark:border-gray-700', className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardFooter.displayName = 'CardFooter';

// Export as compound component
export { Card, CardHeader, CardContent, CardFooter };
export type { CardProps, CardHeaderProps, CardContentProps, CardFooterProps };
