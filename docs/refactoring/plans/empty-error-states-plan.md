# Empty/Error States Standardization Plan

> **Analysis Date**: December 2024
> **Issue**: Component Refactor Item #7 - Inconsistent CTA Buttons
> **Severity**: MEDIUM | **Files Affected**: 48+ | **Effort**: Medium

---

## Executive Summary

A comprehensive audit of the codebase **validates the issues** identified in the component refactor document. The analysis reveals:

- **4 different retry button colors** used across the codebase
- **2 label variations** ("Try Again" vs "Retry")
- **48+ files** with inline error state implementations
- **Mixed icon approaches** (emoji vs Lucide vs none) in empty states

---

## Validated Issues

### 1. Retry Button Color Inconsistency

| Color | Component/Location | Count |
|-------|-------------------|-------|
| **Violet** (`bg-violet-600`) | ErrorDisplay (primary variant) | 7+ |
| **Red** (`bg-red-600` / `variant="danger"`) | ErrorDisplay (inline), DashboardErrorState, page errors | 15+ |
| **Gray** (`bg-gray-900 dark:bg-gray-100`) | ChartError, GlobalError | 3 |
| **Blue** (`bg-blue-600` / `variant="blue"`) | MFA dialogs, SAML error, 404 page | 5+ |

### 2. Retry Button Label Inconsistency

| Label | Files Using | Notes |
|-------|-------------|-------|
| "Try Again" | 20+ files | Most common, default in ErrorDisplay |
| "Retry" | 1 file | DashboardErrorState via `DASHBOARD_MESSAGES.ACTIONS.RETRY` |
| "Try again" (lowercase) | 1 file | ErrorDisplay AlertError variant (text link) |
| Context-specific | 2 files | "Retry Test", "Retry Comparison" |

### 3. Empty State Icon Inconsistency

| Approach | Component | Icon |
|----------|-----------|------|
| Emoji | DashboardEmptyState | 📊 |
| Emoji | row-controls.tsx | 📊 |
| Emoji | dashboard-row-builder.tsx | 📊 |
| None | BaseDataTable | Text only ("No results found") |
| Custom SVG | DashboardErrorState | Warning triangle path |

---

## Core Components Analysis

### ErrorDisplay (`/components/error-display.tsx`)

Well-designed unified system with 4 variants:

| Variant | Button Color | Label | Use Case |
|---------|--------------|-------|----------|
| `full-page` | Violet (`bg-violet-600`) | "Try Again" | Error boundaries |
| `card` | Violet (`bg-violet-600`) | "Try Again" | React Query errors |
| `inline` | Red (`bg-red-600`) | "Try Again" | Data lists/tables |
| `alert` | Text link (red underline) | "Try again" | Form errors |

**Issue**: The `inline` variant uses red while others use violet. This creates visual inconsistency.

### ChartError (`/components/charts/chart-error.tsx`)

```typescript
// Uses inverted gray scheme - different from ErrorDisplay
className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"
```

**Issue**: Chart errors use a completely different color scheme than ErrorDisplay.

### DashboardErrorState (`/components/charts/dashboard-states.tsx`)

```typescript
// Uses Button component with danger variant
<Button variant="danger" size="sm" onClick={onRetry} className="mt-3">
  {DASHBOARD_MESSAGES.ACTIONS.RETRY}  // "Retry" not "Try Again"
</Button>
```

**Issues**:
1. Uses "Retry" label instead of "Try Again"
2. Uses inline SVG icon instead of Lucide

### DashboardEmptyState (`/components/charts/dashboard-states.tsx`)

```typescript
// Uses emoji for icon
<div className="text-6xl mb-4">📊</div>
```

**Issue**: Uses emoji while rest of app uses Lucide icons.

---

## Files with Inline Error Patterns (48 files)

Files implementing `bg-red-50.*border-red-200` error pattern:

**Configuration Pages** (10 files):
- `app/(default)/configure/users/users-content.tsx`
- `app/(default)/configure/practices/practices-content.tsx`
- `app/(default)/configure/dashboards/page.tsx`
- `app/(default)/configure/charts/page.tsx`
- `app/(default)/configure/announcements/page.tsx`
- `app/(default)/configure/organizations/organizations-content.tsx`
- `app/(default)/configure/dashboards/[dashboardId]/edit/page.tsx`
- `app/(default)/configure/charts/[chartId]/edit/page.tsx`
- `app/(default)/configure/practices/[id]/sections/ratings-integration-section.tsx`
- `app/(default)/configure/data-sources/[id]/columns/data-source-columns-content.tsx`

**Dashboard & Charts** (5 files):
- `app/(default)/dashboard/view/[dashboardId]/page.tsx`
- `components/charts/dashboard-states.tsx`
- `components/charts/dashboard-preview.tsx`
- `components/charts/chart-builder-drill-down.tsx`
- `components/charts/chart-fullscreen-modal.tsx`

**Work Items** (4 files):
- `app/(default)/work/[id]/work-item-detail-content.tsx`
- `app/(default)/work/work-items-content.tsx`
- `components/work-items/attachments-list.tsx`
- `components/work-items/file-upload.tsx`

**Admin Command Center** (6 files):
- `app/(default)/admin/command-center/page.tsx`
- `app/(default)/admin/command-center/components/security-events-feed.tsx`
- `app/(default)/admin/command-center/components/at-risk-users-panel.tsx`
- `app/(default)/admin/command-center/components/user-detail-modal.tsx`
- `app/(default)/admin/command-center/components/redis-purge-tools.tsx`
- `app/(default)/admin/command-center/components/toast.tsx`

**Modal Components** (10 files):
- `components/add-work-item-modal.tsx`
- `components/edit-work-item-modal.tsx`
- `components/add-practice-modal.tsx`
- `components/organization-users-modal.tsx`
- `components/manage-relationships-modal.tsx`
- `components/manage-work-item-fields-modal.tsx`
- `components/bulk-user-import-modal.tsx`
- `components/data-source-connection-test-modal.tsx`
- `components/work-item-field-config.tsx`
- `components/attachment-field-renderer.tsx`

**Auth Components** (4 files):
- `components/auth/login-form.tsx`
- `components/auth/mfa-setup-dialog.tsx`
- `components/auth/mfa-verify-dialog.tsx`
- `components/staff-list-embedded.tsx`

**Data Explorer** (3 files):
- `app/(default)/data/explorer/page.tsx`
- `app/(default)/data/explorer/analytics/page.tsx`
- `app/(default)/data/explorer/learning/page.tsx`

**Templates** (4 files - EXCLUDE from migration):
- `templates/classic-professional/components/contact-form.tsx`
- `templates/classic-professional/components/appointment-form.tsx`
- `templates/modern-minimalist/components/appointment-form.tsx`
- `templates/warm-welcoming/components/appointment-form.tsx`

---

## Proposed Solution

### Phase 1: Standardize Retry Button

Create consistent retry button styling across all error states:

**Recommended Standard**:
- **Color**: `bg-violet-600 hover:bg-violet-700` (brand color)
- **Label**: "Try Again" (most common, user-friendly)
- **Icon**: Lucide `RefreshCcw`

**Why Violet?**
1. Aligns with brand color used throughout the app
2. Already used by ErrorDisplay primary variant
3. Stands out without being alarming (red implies danger/destruction)
4. Consistent with Button `variant="primary"` philosophy

### Phase 2: Update ErrorDisplay Variants

Modify `/components/error-display.tsx`:

```typescript
// Current (inconsistent)
function RetryButton({ variant = 'primary' }) {
  const variantClasses = {
    primary: 'bg-violet-600 hover:bg-violet-700',     // Violet
    secondary: 'bg-red-600 hover:bg-red-700',          // Red - WHY?
  };
}

// Proposed (consistent)
function RetryButton({ variant = 'primary' }) {
  const variantClasses = {
    primary: 'bg-violet-600 hover:bg-violet-700',     // Violet
    secondary: 'bg-violet-600 hover:bg-violet-700',   // Also violet
    // Or use Button component with variant="violet"
  };
}
```

**Alternative**: Migrate RetryButton to use the standard `Button` component:

```typescript
import { Button } from '@/components/ui/button';

function RetryButton({ onClick, label = 'Try Again' }) {
  return (
    <Button variant="violet" onClick={onClick} leftIcon={<RefreshCcw className="w-4 h-4" />}>
      {label}
    </Button>
  );
}
```

### Phase 3: Update ChartError

Migrate `/components/charts/chart-error.tsx` to use standard Button:

```typescript
// Current (gray inverted)
<button className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900">
  Try Again
</button>

// Proposed (violet, using Button component)
<Button variant="violet" onClick={onRetry} leftIcon={<RefreshCcw className="w-4 h-4" />}>
  Try Again
</Button>
```

### Phase 4: Update DashboardErrorState

Modify `/components/charts/dashboard-states.tsx`:

```typescript
// Current
<Button variant="danger" size="sm" onClick={onRetry} className="mt-3">
  {DASHBOARD_MESSAGES.ACTIONS.RETRY}  // "Retry"
</Button>

// Proposed
<Button variant="violet" size="sm" onClick={onRetry} className="mt-3"
  leftIcon={<RefreshCcw className="w-4 h-4" />}
>
  Try Again
</Button>
```

Also update `/lib/constants/dashboard-messages.ts`:

```typescript
// Change from "Retry" to "Try Again" for consistency
ACTIONS: {
  RETRY: 'Try Again',  // Was: 'Retry'
},
```

### Phase 5: Update GlobalError

Modify `/app/global-error.tsx` to use violet instead of gray:

```typescript
// Current
className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"

// Proposed - match ErrorDisplay
className="bg-violet-600 hover:bg-violet-700 text-white"
```

### Phase 6: Create EmptyState Component

Create `/components/ui/empty-state.tsx`:

```typescript
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`text-center py-12 ${className}`}>
      {Icon && (
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-full">
            <Icon className="w-8 h-8 text-gray-400 dark:text-gray-500" />
          </div>
        </div>
      )}
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
        {title}
      </h3>
      {description && (
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
```

### Phase 7: Migrate DashboardEmptyState

Update `/components/charts/dashboard-states.tsx`:

```typescript
import { BarChart3 } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

export function DashboardEmptyState() {
  return (
    <EmptyState
      icon={BarChart3}
      title={DASHBOARD_MESSAGES.EMPTY.TITLE}
      description={DASHBOARD_MESSAGES.EMPTY.DESCRIPTION}
    />
  );
}
```

### Phase 8: Migrate Inline Error States

For each of the 48 files with inline error patterns, migrate to use `ErrorDisplay`:

```typescript
// Current (inline pattern)
<div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
  <div className="flex items-center">
    <svg className="w-6 h-6 text-red-600">...</svg>
    <div>
      <h3 className="text-red-800 font-medium">Error loading users</h3>
      <p className="text-red-600 text-sm mt-1">{error}</p>
      <Button variant="danger" size="sm" onClick={refetch} className="mt-3">
        Try Again
      </Button>
    </div>
  </div>
</div>

// Proposed (using ErrorDisplay)
<ErrorDisplay
  variant="inline"
  error={error}
  title="Users"
  onRetry={refetch}
/>
```

---

## Implementation Checklist

### Phase 1: Core Component Updates

- [ ] Update `RetryButton` in `error-display.tsx` to always use violet
- [ ] Update `InlineError` variant to use violet button
- [ ] Update `ChartError` to use `Button variant="violet"`
- [ ] Update `DashboardErrorState` to use violet and "Try Again" label
- [ ] Update `GlobalError` to use violet button
- [ ] Update `DASHBOARD_MESSAGES.ACTIONS.RETRY` to "Try Again"

### Phase 2: New EmptyState Component

- [ ] Create `/components/ui/empty-state.tsx`
- [ ] Define icon presets for common scenarios
- [ ] Update `DashboardEmptyState` to use `EmptyState` with Lucide icon
- [ ] Update other empty states (row-builder, dashboard-preview)

### Phase 3: Migrate Inline Error Patterns

**High Priority** (Configuration pages - 10 files):
- [ ] `users-content.tsx`
- [ ] `practices-content.tsx`
- [ ] `dashboards/page.tsx`
- [ ] `charts/page.tsx`
- [ ] `announcements/page.tsx`
- [ ] `organizations-content.tsx`
- [ ] `dashboards/[dashboardId]/edit/page.tsx`
- [ ] `charts/[chartId]/edit/page.tsx`
- [ ] `ratings-integration-section.tsx`
- [ ] `data-source-columns-content.tsx`

**Medium Priority** (Dashboard & Charts - 5 files):
- [ ] `dashboard/view/[dashboardId]/page.tsx`
- [ ] `dashboard-preview.tsx`
- [ ] `chart-builder-drill-down.tsx`
- [ ] `chart-fullscreen-modal.tsx`
- [ ] `progress-bar-fullscreen-modal.tsx`

**Low Priority** (Admin, Modals, Data Explorer - 24 files):
- [ ] All remaining files listed above

**Exclude** (Templates - 4 files):
- Templates have different design requirements

### Phase 4: Validation

- [ ] Run `pnpm tsc` - verify no type errors
- [ ] Run `pnpm lint` - verify no lint errors
- [ ] Visual review of all error states
- [ ] Verify dark mode works correctly

---

## Expected Outcomes

| Metric | Before | After |
|--------|--------|-------|
| Retry button color variations | 4 | 1 (violet) |
| Label variations | 2+ | 1 ("Try Again") |
| Inline error implementations | 48+ | 0 (use ErrorDisplay) |
| Empty state icon approaches | 3 | 1 (Lucide) |
| New components | 0 | 1 (EmptyState) |

---

## Risks & Considerations

1. **Visual Change Impact**: Changing from red/gray to violet will be noticeable
   - Mitigation: Violet is already the brand color, users expect it

2. **Auth Flow Special Case**: MFA and SAML errors currently use blue
   - Consideration: These may intentionally use blue for auth branding
   - Decision: Include in standardization OR document as approved exception

3. **Inline Alert Overlap**: Item #13 (Alerts/Toasts) may have related work
   - Consider creating `InlineAlert` component alongside `EmptyState`

4. **404 Page**: Currently uses blue "Sign In" button
   - This is navigation, not retry - may be approved exception

---

## Files to Modify

**Core (6 files)**:
1. `/components/error-display.tsx`
2. `/components/charts/chart-error.tsx`
3. `/components/charts/dashboard-states.tsx`
4. `/app/global-error.tsx`
5. `/lib/constants/dashboard-messages.ts`
6. `/components/ui/empty-state.tsx` (NEW)

**Configuration Pages (10 files)**:
7-16. Listed in Phase 3 checklist

**Dashboard & Charts (5 files)**:
17-21. Listed in Phase 3 checklist

**Other (24 files)**:
22-45. Listed in Phase 3 checklist

**Total**: ~45 files (excluding templates)
