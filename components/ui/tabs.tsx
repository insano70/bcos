'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Tab item configuration.
 */
export interface Tab {
  /** Unique identifier for the tab */
  id: string;
  /** Display label for the tab */
  label: string;
  /** Optional icon to display before the label */
  icon?: ReactNode;
}

/**
 * Variant styles for the Tabs component.
 */
const TAB_VARIANTS = {
  /**
   * Underline variant - Standard tab bar with bottom border indicator.
   * Used in most contexts (pages, modals, panels).
   */
  underline: {
    container: 'border-b border-gray-200 dark:border-gray-700',
    nav: 'flex gap-6',
    tab: {
      base: 'pb-3 text-sm font-medium border-b-2 transition-colors',
      active: 'border-violet-500 text-violet-600 dark:text-violet-400',
      inactive:
        'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
    },
  },
  /**
   * Pill variant - Segmented control style with background indicator.
   * Used in modal contexts for a more contained appearance.
   */
  pill: {
    container: 'p-1 bg-gray-100 dark:bg-gray-700/50 rounded-lg',
    nav: 'flex gap-1',
    tab: {
      base: 'flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all',
      active:
        'bg-white dark:bg-gray-800 text-violet-600 dark:text-violet-400 shadow-sm',
      inactive:
        'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200',
    },
  },
} as const;

export type TabVariant = keyof typeof TAB_VARIANTS;

export interface TabsProps {
  /**
   * Array of tab configurations to display.
   */
  tabs: Tab[];

  /**
   * ID of the currently active tab.
   */
  activeTab: string;

  /**
   * Callback fired when a tab is selected.
   */
  onChange: (tabId: string) => void;

  /**
   * Visual style variant of the tabs.
   * @default "underline"
   */
  variant?: TabVariant;

  /**
   * Additional CSS classes for the container element.
   */
  className?: string;

  /**
   * Accessible label for the tab list.
   * @default "Tabs"
   */
  ariaLabel?: string;
}

/**
 * A standardized Tabs component with multiple variants and accessibility features.
 *
 * @example Basic usage with underline variant
 * ```tsx
 * <Tabs
 *   tabs={[
 *     { id: 'details', label: 'Details' },
 *     { id: 'comments', label: 'Comments' },
 *   ]}
 *   activeTab={activeTab}
 *   onChange={setActiveTab}
 * />
 * ```
 *
 * @example Pill variant for modals
 * ```tsx
 * <Tabs
 *   variant="pill"
 *   tabs={[
 *     { id: 'unread', label: 'Unread', icon: <MailIcon /> },
 *     { id: 'history', label: 'History', icon: <ClockIcon /> },
 *   ]}
 *   activeTab={activeTab}
 *   onChange={setActiveTab}
 * />
 * ```
 *
 * @example With icons
 * ```tsx
 * <Tabs
 *   tabs={[
 *     { id: 'analytics', label: 'Analytics Cache', icon: <span>⚡</span> },
 *     { id: 'overview', label: 'Redis Overview', icon: <span>📊</span> },
 *   ]}
 *   activeTab={activeTab}
 *   onChange={setActiveTab}
 * />
 * ```
 */
export function Tabs({
  tabs,
  activeTab,
  onChange,
  variant = 'underline',
  className,
  ariaLabel = 'Tabs',
}: TabsProps) {
  const variantStyles = TAB_VARIANTS[variant];

  return (
    <div className={cn(variantStyles.container, className)}>
      <nav className={variantStyles.nav} role="tablist" aria-label={ariaLabel}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              id={`tab-${tab.id}`}
              onClick={() => onChange(tab.id)}
              className={cn(
                variantStyles.tab.base,
                isActive ? variantStyles.tab.active : variantStyles.tab.inactive
              )}
            >
              {tab.icon && (
                <span className="mr-2 inline-flex items-center">{tab.icon}</span>
              )}
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/**
 * Helper component for tab panel content.
 * Provides proper ARIA attributes for accessibility.
 *
 * @example
 * ```tsx
 * <TabPanel id="details" activeTab={activeTab}>
 *   <p>Details content here</p>
 * </TabPanel>
 * ```
 */
export interface TabPanelProps {
  /** ID matching the tab that controls this panel */
  id: string;
  /** Currently active tab ID */
  activeTab: string;
  /** Panel content */
  children: ReactNode;
  /** Additional CSS classes */
  className?: string;
}

export function TabPanel({
  id,
  activeTab,
  children,
  className,
}: TabPanelProps) {
  const isActive = activeTab === id;

  if (!isActive) {
    return null;
  }

  return (
    <div
      id={`tabpanel-${id}`}
      role="tabpanel"
      aria-labelledby={`tab-${id}`}
      className={className}
    >
      {children}
    </div>
  );
}

export default Tabs;
