import { memo, type ReactElement } from 'react';

// ============================================
// SHARED TYPES
// ============================================

export type AlertType = 'warning' | 'error' | 'success' | 'info';
export type AlertVariant = 'solid' | 'light' | 'outlined';

// ============================================
// SHARED ICON PATHS
// ============================================

export const ALERT_ICON_PATHS: Record<AlertType, string> = {
  warning:
    'M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm0 12c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zm1-3H7V4h2v5z',
  error:
    'M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm3.5 10.1l-1.4 1.4L8 9.4l-2.1 2.1-1.4-1.4L6.6 8 4.5 5.9l1.4-1.4L8 6.6l2.1-2.1 1.4 1.4L9.4 8l2.1 2.1z',
  success:
    'M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zM7 11.4L3.6 8 5 6.6l2 2 4-4L12.4 6 7 11.4z',
  info: 'M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm1 12H7V7h2v5zM8 6c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1z',
};

// ============================================
// SHARED VARIANT STYLES
// ============================================

export const ALERT_VARIANT_STYLES = {
  solid: {
    containerBase: 'text-white',
    iconClass: 'opacity-80',
    fontWeight: 'font-medium',
    colors: {
      warning: 'bg-yellow-500',
      error: 'bg-red-500',
      success: 'bg-green-500',
      info: 'bg-violet-500',
    },
    iconColors: {
      warning: '',
      error: '',
      success: '',
      info: '',
    },
  },
  light: {
    containerBase: 'text-gray-700 dark:text-gray-200',
    iconClass: '',
    fontWeight: '',
    colors: {
      warning: 'bg-yellow-100 dark:bg-yellow-900/30',
      error: 'bg-red-100 dark:bg-red-900/30',
      success: 'bg-green-100 dark:bg-green-900/30',
      info: 'bg-violet-100 dark:bg-violet-900/30',
    },
    iconColors: {
      warning: 'text-yellow-500 dark:text-yellow-400',
      error: 'text-red-500 dark:text-red-400',
      success: 'text-green-500 dark:text-green-400',
      info: 'text-violet-500 dark:text-violet-400',
    },
  },
  outlined: {
    containerBase:
      'bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-100',
    iconClass: '',
    fontWeight: '',
    colors: {
      warning: '',
      error: '',
      success: '',
      info: '',
    },
    iconColors: {
      warning: 'text-yellow-500 dark:text-yellow-400',
      error: 'text-red-500 dark:text-red-400',
      success: 'text-green-500 dark:text-green-400',
      info: 'text-violet-500 dark:text-violet-400',
    },
  },
} as const;

// ============================================
// SHARED ICON COMPONENTS
// ============================================

interface AlertIconProps {
  type: AlertType;
  variant: AlertVariant;
}

export const AlertIcon = memo(function AlertIcon({
  type,
  variant,
}: AlertIconProps): ReactElement {
  const styles = ALERT_VARIANT_STYLES[variant];
  const iconColorClass = styles.iconColors[type] || styles.iconClass;

  return (
    <svg
      className={`shrink-0 fill-current ${iconColorClass} mt-[3px] mr-3`}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path d={ALERT_ICON_PATHS[type]} />
    </svg>
  );
});

export const CloseIcon = memo(function CloseIcon(): ReactElement {
  return (
    <svg
      className="fill-current"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path d="M7.95 6.536l4.242-4.243a1 1 0 111.415 1.414L9.364 7.95l4.243 4.242a1 1 0 11-1.415 1.415L7.95 9.364l-4.243 4.243a1 1 0 01-1.414-1.415L6.536 7.95 2.293 3.707a1 1 0 011.414-1.414L7.95 6.536z" />
    </svg>
  );
});

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Normalize empty string type to 'info' for internal use
 */
export function normalizeAlertType(type: AlertType | ''): AlertType {
  return type === '' ? 'info' : type;
}
