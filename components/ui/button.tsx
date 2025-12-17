'use client';

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
  Children,
} from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';

/**
 * Size presets for the Button component.
 * Aligned with existing .btn-* CSS utility classes.
 */
const BUTTON_SIZES = {
  /** px-2 py-0.5 - Compact inline areas */
  xs: 'px-2 py-0.5 text-xs',
  /** px-2 py-1 - Dropdown actions, table rows */
  sm: 'px-2 py-1 text-sm',
  /** px-3 py-2 - Default, most buttons */
  md: 'px-3 py-2 text-sm',
  /** px-4 py-3 - Prominent CTAs */
  lg: 'px-4 py-3 text-sm',
} as const;

export type ButtonSize = keyof typeof BUTTON_SIZES;

/**
 * Variant presets for the Button component.
 * Based on patterns extracted from the codebase.
 */
const BUTTON_VARIANTS = {
  /** Primary (dark) - Main CTAs */
  primary: {
    base: 'bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white border-transparent',
    focus: 'focus-visible:ring-violet-500',
  },
  /** Secondary (outline) - Secondary actions */
  secondary: {
    base: 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300',
    focus: 'focus-visible:ring-violet-500',
  },
  /** Danger (red solid) - Destructive actions */
  danger: {
    base: 'bg-red-500 hover:bg-red-600 text-white border-transparent',
    focus: 'focus-visible:ring-red-500',
  },
  /** Danger outline - Less prominent destructive actions */
  'danger-outline': {
    base: 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-red-500',
    focus: 'focus-visible:ring-red-500',
  },
  /** Blue - Form submissions, CRUD modals */
  blue: {
    base: 'bg-blue-600 hover:bg-blue-700 text-white border-transparent',
    focus: 'focus-visible:ring-blue-500',
  },
  /** Violet - Brand actions */
  violet: {
    base: 'bg-violet-500 hover:bg-violet-600 text-white border-transparent',
    focus: 'focus-visible:ring-violet-500',
  },
  /** Success (green) - Positive actions, confirmations */
  success: {
    base: 'bg-emerald-500 hover:bg-emerald-600 text-white border-transparent',
    focus: 'focus-visible:ring-emerald-500',
  },
  /** Blue outline - Secondary blue actions */
  'blue-outline': {
    base: 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-blue-600 dark:text-blue-400',
    focus: 'focus-visible:ring-blue-500',
  },
  /** Ghost - Icon buttons, minimal emphasis */
  ghost: {
    base: 'bg-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 border-transparent shadow-none',
    focus: 'focus-visible:ring-violet-500',
  },
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;

/**
 * Base styles shared across all button variants.
 */
const BUTTON_BASE_STYLES =
  'font-medium inline-flex items-center justify-center border rounded-lg leading-5 shadow-sm transition';

/**
 * Focus ring styles for accessibility.
 * Uses focus-visible to avoid showing on mouse clicks.
 */
const BUTTON_FOCUS_STYLES =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900';

/**
 * Disabled state styles.
 */
const BUTTON_DISABLED_STYLES = 'disabled:opacity-50 disabled:cursor-not-allowed';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Visual style variant of the button.
   * @default "primary"
   */
  variant?: ButtonVariant;

  /**
   * Size preset for the button.
   * @default "md"
   */
  size?: ButtonSize;

  /**
   * Shows a loading spinner and disables the button.
   * When true, the button displays a spinner and optional loading text.
   * @default false
   */
  loading?: boolean;

  /**
   * Text to display while loading.
   * If not provided, shows the original children with spinner.
   */
  loadingText?: string;

  /**
   * Icon element to render on the left side of the button text.
   * Should be a React element (e.g., Lucide icon).
   */
  leftIcon?: ReactNode;

  /**
   * Icon element to render on the right side of the button text.
   * Should be a React element (e.g., Lucide icon).
   */
  rightIcon?: ReactNode;

  /**
   * If true, the button expands to fill its container width.
   * @default false
   */
  fullWidth?: boolean;
}

/**
 * A standardized Button component with multiple variants, sizes,
 * loading states, and accessibility features.
 *
 * @example Basic usage
 * ```tsx
 * <Button variant="primary" size="md">Click me</Button>
 * ```
 *
 * @example With loading state
 * ```tsx
 * <Button loading loadingText="Saving...">Save</Button>
 * ```
 *
 * @example With icons
 * ```tsx
 * <Button leftIcon={<PlusIcon className="h-4 w-4" />}>Add Item</Button>
 * ```
 *
 * @example Icon-only button with accessibility
 * ```tsx
 * <Button variant="ghost" aria-label="Delete item">
 *   <TrashIcon className="h-4 w-4" />
 * </Button>
 * ```
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      loadingText,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      className,
      children,
      ...props
    },
    ref
  ) => {
    // Dev mode warning for icon-only buttons without aria-label
    if (process.env.NODE_ENV !== 'production') {
      const hasChildren = Children.count(children) > 0;
      const hasIcons = Boolean(leftIcon) || Boolean(rightIcon);
      const hasAriaLabel = Boolean(props['aria-label']);

      if (!hasChildren && hasIcons && !hasAriaLabel) {
        console.warn(
          'Button: Icon-only buttons should have an aria-label for accessibility.'
        );
      }
    }

    const variantConfig = BUTTON_VARIANTS[variant];
    const isDisabled = disabled || loading;

    const buttonClasses = cn(
      BUTTON_BASE_STYLES,
      BUTTON_SIZES[size],
      variantConfig.base,
      BUTTON_FOCUS_STYLES,
      variantConfig.focus,
      BUTTON_DISABLED_STYLES,
      fullWidth && 'w-full',
      className
    );

    const renderContent = () => {
      if (loading) {
        return (
          <>
            <Spinner
              size="sm"
              trackClassName="border-current opacity-25"
              indicatorClassName="border-current"
              className="shrink-0"
            />
            {loadingText ? (
              <span className="ml-2">{loadingText}</span>
            ) : children ? (
              <span className="ml-2">{children}</span>
            ) : null}
          </>
        );
      }

      return (
        <>
          {leftIcon && <span className="shrink-0 -ml-1 mr-2">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="shrink-0 ml-2 -mr-1">{rightIcon}</span>}
        </>
      );
    };

    return (
      <button
        ref={ref}
        type="button"
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={buttonClasses}
        {...props}
      >
        {renderContent()}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
