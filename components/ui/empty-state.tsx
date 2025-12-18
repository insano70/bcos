/**
 * EmptyState Component
 *
 * A standardized empty state display for when there's no content to show.
 * Replaces inconsistent emoji-based empty states with Lucide icons.
 *
 * @example
 * ```tsx
 * import { EmptyState } from '@/components/ui/empty-state';
 * import { BarChart3 } from 'lucide-react';
 *
 * <EmptyState
 *   icon={BarChart3}
 *   title="Empty Dashboard"
 *   description="This dashboard doesn't have any charts yet."
 * />
 * ```
 */

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  /** Lucide icon component to display */
  icon?: LucideIcon | undefined;
  /** Main title text */
  title: string;
  /** Optional description text */
  description?: string | undefined;
  /** Optional action element (button, link, etc.) */
  action?: ReactNode | undefined;
  /** Additional CSS classes for the container */
  className?: string | undefined;
  /** Icon size variant */
  iconSize?: 'sm' | 'md' | 'lg' | undefined;
}

const ICON_SIZES = {
  sm: {
    container: 'p-2',
    icon: 'w-6 h-6',
  },
  md: {
    container: 'p-3',
    icon: 'w-8 h-8',
  },
  lg: {
    container: 'p-4',
    icon: 'w-12 h-12',
  },
} as const;

/**
 * EmptyState
 *
 * Displays a centered empty state with optional icon, title, description, and action.
 * Uses Lucide icons for consistency with the rest of the application.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = '',
  iconSize = 'md',
}: EmptyStateProps) {
  const sizes = ICON_SIZES[iconSize];

  return (
    <div className={`text-center py-12 ${className}`}>
      {Icon && (
        <div className="flex justify-center mb-4">
          <div className={`${sizes.container} bg-gray-100 dark:bg-gray-800 rounded-full`}>
            <Icon className={`${sizes.icon} text-gray-400 dark:text-gray-500`} />
          </div>
        </div>
      )}
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        {title}
      </h3>
      {description && (
        <p className="text-gray-600 dark:text-gray-400 mt-2 max-w-md mx-auto">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export default EmptyState;
