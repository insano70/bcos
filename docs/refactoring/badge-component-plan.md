# Badge Component Standardization Plan

> **Generated**: December 2024
> **Status**: Ready for Review
> **Scope**: Create unified Badge component to replace 90+ inline implementations

---

## Executive Summary

The codebase has **no reusable Badge component**. Status indicators are implemented inline across **30+ files** with **66+ occurrences** of badge-like patterns. Each page implements its own color mapping functions (`getPriorityColor`, `getStatusColor`, `getPriorityBadge`, etc.) leading to:

- Inconsistent visual appearance (padding, opacity, dark mode)
- Duplicated code (15+ separate color mapping functions)
- Difficult maintenance (changes require updates in many files)
- Accessibility gaps (some badges missing proper semantics)

---

## Current State Analysis

### Existing Badge Components (3 total - specialized)

| Component | Location | Purpose | Reusable? |
|-----------|----------|---------|-----------|
| `ColorContrastBadge` | `/components/color-contrast-badge.tsx` | WCAG compliance display | No (domain-specific) |
| `AnnouncementBadge` | `/components/announcements/announcement-badge.tsx` | Notification count | No (notification bell integration) |
| `CacheHealthBadge` | `/app/(default)/admin/command-center/components/cache-health-badge.tsx` | Cache status with emoji | Partially (good pattern to follow) |

### Inline Pattern Locations (30+ files)

**Configuration Pages**:
- `app/(default)/configure/announcements/page.tsx` - Priority, target, status badges
- `app/(default)/configure/charts/page.tsx` - Chart type badges
- `app/(default)/configure/dashboards/page.tsx` - Chart count, status badges
- `app/(default)/configure/practices/practices-content.tsx` - Practice status
- `app/(default)/configure/organizations/organizations-content.tsx` - Org status
- `app/(default)/configure/users/users-content.tsx` - MFA, account status
- `app/(default)/configure/work-item-types/work-item-types-content.tsx` - Type badges
- `app/(default)/configure/data-sources/data-sources-content.tsx` - Connection status
- `app/(default)/configure/data-sources/[id]/columns/data-source-columns-content.tsx` - Data type badges

**Work Item Pages**:
- `app/(default)/work/work-items-content.tsx` - Status, priority badges
- `app/(default)/work/[id]/work-item-detail-content.tsx` - Status, priority badges
- `components/work-items/work-item-hierarchy-section.tsx` - Priority indicators

**Admin/Monitoring**:
- `app/(default)/admin/command-center/components/warming-job-list.tsx` - Job status
- `app/(default)/admin/command-center/components/security-events-feed.tsx` - Severity badges
- `app/(default)/admin/command-center/components/*-kpi.tsx` - Various status indicators

**Data Explorer**:
- `app/(default)/data/explorer/feedback/page.tsx` - Status, severity badges
- `app/(default)/data/explorer/test-cases/page.tsx` - Priority badges
- `app/(default)/data/explorer/suggestions/page.tsx` - Status badges

### Identified Inconsistencies

#### 1. Padding Variations
| Pattern | Usage | Files |
|---------|-------|-------|
| `px-2 py-0.5` | Admin panels | warming-job-list, security-events |
| `px-2 py-1` | Work items | work-items-content, practices-content |
| `px-2.5 py-0.5` | Most common | announcements, charts, dashboards, feedback |
| `px-3 py-1` | Larger badges | work-item-detail priority |

#### 2. Border Radius
| Pattern | Usage |
|---------|-------|
| `rounded-full` | 95% of badges |
| `rounded` | Security events, warming jobs, data types |
| `rounded-lg` | ColorContrastBadge full mode |

#### 3. Dark Mode Background Opacity
| Pattern | Usage | Files |
|---------|-------|-------|
| `dark:bg-*-900/30` | Work items, practices | work-items-content, practices-content |
| `dark:bg-*-900/20` | Announcements, charts, feedback | announcements, charts, dashboards, feedback |
| `dark:bg-*-500/20` | Data sources | data-sources-content |

#### 4. Text Color Shades
| Pattern | Usage |
|---------|-------|
| `text-*-700` + `dark:text-*-400` | Work items, practices |
| `text-*-800` + `dark:text-*-200` | Announcements, charts, most admin |
| `text-*-600` + `dark:text-*-400` | Warming jobs, data sources |

#### 5. Color Mapping Function Locations (15+ duplicates)
```
getPriorityColor() - work-items-content.tsx, test-cases/page.tsx, work-item-hierarchy-section.tsx
getStatusColor() - work-items-content.tsx, practices-content.tsx, feedback/page.tsx, warming-job-list.tsx
getPriorityBadge() - announcements/page.tsx
getChartTypeBadgeColor() - charts/page.tsx
getChartCountBadgeColor() - dashboards/page.tsx
getSeverityColor() - feedback/page.tsx
getHealthBadgeClasses() - analytics-cache-health.ts
```

---

## Proposed Solution

### New Component: `/components/ui/badge.tsx`

```tsx
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

export type BadgeColor = keyof typeof BADGE_COLORS;

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

export type BadgeSize = keyof typeof BADGE_SIZES;

/**
 * Badge variant presets.
 * - filled: Solid background (default)
 * - outlined: Border with subtle background
 */
const BADGE_VARIANTS = {
  filled: '',
  outlined: 'border',
} as const;

export type BadgeVariant = keyof typeof BADGE_VARIANTS;

/**
 * Badge shape presets.
 * - pill: Fully rounded (default, most badges)
 * - rounded: Slightly rounded corners (admin panels)
 */
const BADGE_SHAPES = {
  pill: 'rounded-full',
  rounded: 'rounded',
} as const;

export type BadgeShape = keyof typeof BADGE_SHAPES;

export interface BadgeProps {
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
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
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

// Re-export color constants for programmatic use
export { BADGE_COLORS, BADGE_SIZES };
```

### Semantic Badge Mappings: `/lib/utils/badge-colors.ts`

```tsx
import type { BadgeColor } from '@/components/ui/badge';

/**
 * Work item priority to badge color mapping.
 * Used by work items list, detail view, hierarchy section.
 */
export const PRIORITY_COLORS: Record<string, BadgeColor> = {
  critical: 'red',
  high: 'orange',
  medium: 'yellow',
  low: 'green',
};

/**
 * Get badge color for work item priority.
 */
export function getPriorityBadgeColor(priority: string): BadgeColor {
  return PRIORITY_COLORS[priority.toLowerCase()] ?? 'gray';
}

/**
 * Work item status category to badge color mapping.
 */
export const STATUS_CATEGORY_COLORS: Record<string, BadgeColor> = {
  backlog: 'gray',
  in_progress: 'blue',
  completed: 'green',
  cancelled: 'red',
};

/**
 * Get badge color for work item status category.
 */
export function getStatusBadgeColor(category: string): BadgeColor {
  return STATUS_CATEGORY_COLORS[category.toLowerCase()] ?? 'gray';
}

/**
 * Announcement priority to badge color mapping.
 */
export const ANNOUNCEMENT_PRIORITY_COLORS: Record<string, BadgeColor> = {
  urgent: 'red',
  high: 'orange',
  normal: 'blue',
  low: 'gray',
};

/**
 * Get badge color for announcement priority.
 */
export function getAnnouncementPriorityColor(priority: string): BadgeColor {
  return ANNOUNCEMENT_PRIORITY_COLORS[priority.toLowerCase()] ?? 'blue';
}

/**
 * Chart type to badge color mapping.
 */
export const CHART_TYPE_COLORS: Record<string, BadgeColor> = {
  line: 'blue',
  bar: 'green',
  pie: 'purple',
  doughnut: 'orange',
  area: 'teal',
  scatter: 'indigo',
  table: 'gray',
};

/**
 * Get badge color for chart type.
 */
export function getChartTypeBadgeColor(chartType: string): BadgeColor {
  return CHART_TYPE_COLORS[chartType.toLowerCase()] ?? 'gray';
}

/**
 * Boolean active/inactive status to badge color.
 */
export function getActiveStatusColor(isActive: boolean): BadgeColor {
  return isActive ? 'green' : 'gray';
}

/**
 * Practice status to badge color mapping.
 */
export const PRACTICE_STATUS_COLORS: Record<string, BadgeColor> = {
  active: 'green',
  inactive: 'red',
  pending: 'yellow',
};

/**
 * Get badge color for practice status.
 */
export function getPracticeStatusColor(status: string): BadgeColor {
  return PRACTICE_STATUS_COLORS[status.toLowerCase()] ?? 'gray';
}

/**
 * Feedback status to badge color mapping.
 */
export const FEEDBACK_STATUS_COLORS: Record<string, BadgeColor> = {
  pending: 'yellow',
  resolved: 'green',
  metadata_updated: 'blue',
  instruction_created: 'purple',
  relationship_added: 'indigo',
  wont_fix: 'gray',
};

/**
 * Get badge color for feedback status.
 */
export function getFeedbackStatusColor(status: string): BadgeColor {
  return FEEDBACK_STATUS_COLORS[status.toLowerCase()] ?? 'gray';
}

/**
 * Feedback severity to badge color mapping.
 */
export const FEEDBACK_SEVERITY_COLORS: Record<string, BadgeColor> = {
  high: 'red',
  medium: 'yellow',
  low: 'blue',
};

/**
 * Get badge color for feedback severity.
 */
export function getFeedbackSeverityColor(severity: string): BadgeColor {
  return FEEDBACK_SEVERITY_COLORS[severity.toLowerCase()] ?? 'gray';
}

/**
 * Warming job status to badge color mapping.
 */
export const WARMING_STATUS_COLORS: Record<string, BadgeColor> = {
  queued: 'gray',
  warming: 'blue',
  completed: 'green',
  failed: 'red',
};

/**
 * Get badge color for warming job status.
 */
export function getWarmingStatusColor(status: string): BadgeColor {
  return WARMING_STATUS_COLORS[status.toLowerCase()] ?? 'gray';
}

/**
 * Data type to badge color mapping (for data source columns).
 */
export const DATA_TYPE_COLORS: Record<string, BadgeColor> = {
  string: 'indigo',
  text: 'indigo',
  varchar: 'indigo',
  integer: 'teal',
  int: 'teal',
  bigint: 'teal',
  number: 'teal',
  numeric: 'teal',
  decimal: 'amber',
  float: 'amber',
  double: 'amber',
  boolean: 'red',
  bool: 'red',
  date: 'purple',
  datetime: 'purple',
  timestamp: 'purple',
  time: 'violet',
  uuid: 'blue',
  json: 'orange',
  jsonb: 'orange',
  array: 'green',
};

/**
 * Get badge color for data type.
 */
export function getDataTypeBadgeColor(dataType: string): BadgeColor {
  const normalizedType = dataType.toLowerCase().replace(/\(.*\)/, '').trim();
  return DATA_TYPE_COLORS[normalizedType] ?? 'gray';
}
```

---

## Migration Strategy

### Phase 1: Create Component & Utilities (1 task)
1. Create `/components/ui/badge.tsx` with component implementation
2. Create `/lib/utils/badge-colors.ts` with semantic color mappings
3. Add exports to component index if applicable

### Phase 2: Migrate High-Traffic Pages (8 files)
Priority based on usage frequency and visibility:

| Priority | File | Badges to Migrate |
|----------|------|-------------------|
| 1 | `app/(default)/work/work-items-content.tsx` | Status, Priority |
| 2 | `app/(default)/work/[id]/work-item-detail-content.tsx` | Status, Priority |
| 3 | `app/(default)/configure/announcements/page.tsx` | Priority, Target, Status |
| 4 | `app/(default)/configure/users/users-content.tsx` | MFA, Account Status |
| 5 | `app/(default)/configure/practices/practices-content.tsx` | Practice Status |
| 6 | `app/(default)/configure/organizations/organizations-content.tsx` | Org Status |
| 7 | `app/(default)/configure/charts/page.tsx` | Chart Type, Status |
| 8 | `app/(default)/configure/dashboards/page.tsx` | Chart Count, Status |

### Phase 3: Migrate Admin/Monitoring (5 files)
| File | Badges to Migrate |
|------|-------------------|
| `app/(default)/admin/command-center/components/warming-job-list.tsx` | Job Status |
| `app/(default)/admin/command-center/components/security-events-feed.tsx` | Severity |
| `app/(default)/admin/command-center/components/*-kpi.tsx` | Various status |

### Phase 4: Migrate Data Explorer (3 files)
| File | Badges to Migrate |
|------|-------------------|
| `app/(default)/data/explorer/feedback/page.tsx` | Status, Severity |
| `app/(default)/data/explorer/test-cases/page.tsx` | Priority |
| `app/(default)/data/explorer/suggestions/page.tsx` | Status |

### Phase 5: Migrate Remaining Files (6+ files)
| File | Badges to Migrate |
|------|-------------------|
| `app/(default)/configure/work-item-types/work-item-types-content.tsx` | Type badges |
| `app/(default)/configure/data-sources/data-sources-content.tsx` | Connection status |
| `app/(default)/configure/data-sources/[id]/columns/data-source-columns-content.tsx` | Data type |
| `components/work-items/work-item-hierarchy-section.tsx` | Priority indicators |
| `components/user-picker.tsx` | User status |
| `components/organization-users-modal.tsx` | User badges |

### Phase 6: Cleanup
1. Remove duplicate `getPriorityColor`, `getStatusColor` functions from migrated files
2. Verify all badge patterns are using the standardized component
3. Update component documentation

---

## Migration Example

### Before (work-items-content.tsx)

```tsx
const getPriorityColor = useCallback((priority: string) => {
  switch (priority) {
    case 'critical':
      return 'text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
    case 'high':
      return 'text-orange-700 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400';
    // ...
  }
}, []);

// In render:
<span className={`inline-flex items-center justify-center px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor(item.priority)}`}>
  {item.priority}
</span>
```

### After (work-items-content.tsx)

```tsx
import { Badge } from '@/components/ui/badge';
import { getPriorityBadgeColor, getStatusBadgeColor } from '@/lib/utils/badge-colors';

// In render:
<Badge color={getPriorityBadgeColor(item.priority)} size="sm">
  {item.priority}
</Badge>

<Badge color={getStatusBadgeColor(item.status_category)} size="sm">
  {item.status_name}
</Badge>
```

---

## Exceptions (Do NOT Migrate)

| Component | Reason |
|-----------|--------|
| `ColorContrastBadge` | Domain-specific (WCAG contrast), has custom icons/descriptions |
| `AnnouncementBadge` | Notification count badge, integrated with bell icon |
| `CacheHealthBadge` | Uses emojis and health scoring system, keep as-is |

---

## Success Criteria

- [ ] `/components/ui/badge.tsx` created with all variants
- [ ] `/lib/utils/badge-colors.ts` created with semantic mappings
- [ ] All 30+ files migrated to use `Badge` component
- [ ] Duplicate color mapping functions removed
- [ ] Visual consistency verified (dark mode, hover states)
- [ ] `pnpm tsc` passes
- [ ] `pnpm lint` passes

---

## Estimated Effort

| Phase | Files | Complexity |
|-------|-------|------------|
| Phase 1: Create Component | 2 new files | Low |
| Phase 2: High-Traffic | 8 files | Medium |
| Phase 3: Admin | 5 files | Low |
| Phase 4: Data Explorer | 3 files | Low |
| Phase 5: Remaining | 6+ files | Low |
| Phase 6: Cleanup | N/A | Low |

**Total**: ~24 files to modify, 2 new files to create
