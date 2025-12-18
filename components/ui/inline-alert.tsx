'use client';

import { memo } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from 'lucide-react';

export type InlineAlertType = 'error' | 'warning' | 'success' | 'info';

export interface InlineAlertProps {
  type: InlineAlertType;
  title?: string;
  children: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}

const ALERT_STYLES: Record<
  InlineAlertType,
  {
    container: string;
    icon: string;
    title: string;
    text: string;
    IconComponent: typeof AlertCircle;
  }
> = {
  error: {
    container: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    icon: 'text-red-500 dark:text-red-400',
    title: 'text-red-800 dark:text-red-200',
    text: 'text-red-700 dark:text-red-300',
    IconComponent: AlertCircle,
  },
  warning: {
    container: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
    icon: 'text-yellow-500 dark:text-yellow-400',
    title: 'text-yellow-800 dark:text-yellow-200',
    text: 'text-yellow-700 dark:text-yellow-300',
    IconComponent: AlertTriangle,
  },
  success: {
    container: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    icon: 'text-green-500 dark:text-green-400',
    title: 'text-green-800 dark:text-green-200',
    text: 'text-green-700 dark:text-green-300',
    IconComponent: CheckCircle,
  },
  info: {
    container: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    icon: 'text-blue-500 dark:text-blue-400',
    title: 'text-blue-800 dark:text-blue-200',
    text: 'text-blue-700 dark:text-blue-300',
    IconComponent: Info,
  },
};

export const InlineAlert = memo(function InlineAlert({
  type,
  title,
  children,
  onDismiss,
  className = '',
}: InlineAlertProps) {
  const styles = ALERT_STYLES[type];
  const { IconComponent } = styles;

  return (
    <div role="alert" className={`border rounded-lg p-4 ${styles.container} ${className}`}>
      <div className="flex items-start gap-3">
        <IconComponent className={`w-5 h-5 flex-shrink-0 mt-0.5 ${styles.icon}`} />
        <div className="flex-1 min-w-0">
          {title && <h4 className={`font-medium ${styles.title}`}>{title}</h4>}
          <div className={`text-sm ${title ? 'mt-1' : ''} ${styles.text}`}>{children}</div>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className={`flex-shrink-0 ${styles.icon} hover:opacity-70`}
            aria-label="Dismiss"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
});

export default InlineAlert;
