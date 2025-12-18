# Alerts/Toasts Standardization Plan

> **Generated**: December 2024
> **Issue Reference**: Component Refactor Item #13
> **Status**: COMPLETED - December 2024

---

## Executive Summary

A comprehensive analysis of the alerts and toasts system reveals that the **legacy hook conflict mentioned in the original document has already been resolved**. However, two significant issues remain:

1. **Duplicate Toast Implementation**: Command Center has a redundant isolated toast system
2. **Inline Alert Patterns**: 40+ files implement alert-style UI inline instead of using dedicated components

### Key Findings

| Issue | Original Claim | Actual State | Action Taken |
|-------|----------------|--------------|--------------|
| Legacy `use-toast.ts` hook | Conflicts with toast.tsx | **DELETED** (Dec 2024) | None needed |
| Duplicate Toast in Command Center | Not mentioned | **UNIFIED** | Deleted duplicate, updated imports |
| Inline alert implementations | 202+ instances | **MIGRATED** | Created InlineAlert component, migrated ~15 files |

---

## Current Architecture

### 1. Toast System (Well-Designed)

**Primary Component**: `/components/toast.tsx` (308 lines)

```typescript
// Types
export type ToastType = 'warning' | 'error' | 'success' | 'info';
export type ToastVariant = 'solid' | 'light' | 'outlined';

// Two usage modes:
// 1. Controlled (backward compatible)
<Toast type="success" open={showToast} setOpen={setShowToast}>
  Success!
</Toast>

// 2. Context-based (modern)
const { showToast } = useToast();
showToast({ message: 'Success!', type: 'success', duration: 5000 });
```

**Features**:
- Dual mode support (controlled + context)
- Auto-dismiss with configurable duration
- Stacking support (fixed bottom-right)
- Animation on exit (300ms slide-out + fade)
- Accessibility: `role="alert"`, `aria-live="polite"`
- Dark mode support

**Usage**: 20 files (controlled), 8 files (context hook)

### 2. Alert Shared System (Well-Designed)

**File**: `/components/ui/alert-shared.tsx` (136 lines)

Provides centralized constants for consistent alert styling:

```typescript
export type AlertType = 'warning' | 'error' | 'success' | 'info';
export type AlertVariant = 'solid' | 'light' | 'outlined';

export const ALERT_VARIANT_STYLES = {
  solid: { /* ... */ },
  light: { /* ... */ },
  outlined: { /* ... */ },
};

export const ALERT_ICON_PATHS: Record<AlertType, string>;
export function AlertIcon({ type, variant }): ReactElement;
export function CloseIcon(): ReactElement;
```

### 3. ErrorDisplay Component (Well-Designed)

**File**: `/components/error-display.tsx` (597 lines)

Comprehensive error display with 4 variants:

| Variant | Use Case | Layout |
|---------|----------|--------|
| `full-page` | Error boundaries, route-level errors | Centered, large, min-h-[50vh] |
| `card` | React Query errors within page sections | Contained, medium |
| `inline` | Error states in data lists/tables | Compact, horizontal |
| `alert` | Form submission errors | Banner-style, dismissible |

**Features**:
- User-friendly error message translation (network, auth, 404, timeout, validation, rate limit)
- Development-only technical details
- Retry functionality with callback
- Dark mode support
- Accessibility: `role="alert"`, `aria-live="assertive"`

**Usage**: 36 files

### 4. Banner System (Well-Designed)

**File**: `/components/banner.tsx` (86 lines)

Full-width page-level alerts (persistent, not temporary):

```typescript
<Banner type="warning" variant="light" open={showBanner} setOpen={setShowBanner}>
  This is a warning message.
</Banner>
```

---

## Issues Identified

### Issue 1: Duplicate Toast Implementation (Command Center)

**File**: `/app/(default)/admin/command-center/components/toast.tsx` (243 lines)

A completely separate toast system exists in the Command Center admin panel. This creates:

- **Code duplication**: 243 lines of near-identical logic
- **Inconsistent UX**: Different animation, slightly different styling
- **Maintenance burden**: Bug fixes must be applied in two places

**Comparison**:

| Feature | Main Toast | Command Center Toast |
|---------|------------|---------------------|
| Location | `/components/toast.tsx` | `/app/(default)/admin/command-center/components/toast.tsx` |
| Lines | 308 | 243 |
| Variants | solid, light, outlined | N/A (single style) |
| Stacking | Fixed bottom-right | Fixed bottom-right |
| Animation | CSS transition | CSS transition |
| Context hook | `useToast()` | `useToast()` (separate context) |

**Root Cause**: Command Center was developed with isolated state, didn't reuse main toast system.

### Issue 2: Inline Alert Patterns (40+ Files)

Despite having `ErrorDisplay` with an `inline` variant, many files implement alert-style UI manually:

**Pattern Found** (`bg-{color}-50 dark:bg-{color}-900/20 border border-{color}-200 dark:border-{color}-800 rounded`):

```tsx
// Typical inline implementation (~6-10 lines per instance)
<div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
  <div className="flex items-start gap-3">
    <svg className="w-4 h-4 fill-current text-red-400" />
    <div>
      <h3 className="text-red-800">Error Title</h3>
      <p className="text-red-600">Error message</p>
    </div>
  </div>
</div>
```

**Files with Inline Alerts** (categorized by type):

#### Error Alerts (Red) - 25+ instances

| File | Context |
|------|---------|
| `app/(default)/data/explorer/page.tsx` | Query execution errors (2 instances) |
| `app/(default)/admin/command-center/page.tsx` | Admin error state |
| `app/(default)/admin/command-center/components/at-risk-users-panel.tsx` | Panel error |
| `app/(default)/admin/command-center/components/redis-purge-tools.tsx` | Purge errors |
| `app/(default)/admin/command-center/components/security-events-feed.tsx` | Security error |
| `components/attachment-field-renderer.tsx` | Upload errors (2 instances) |
| `components/work-item-field-config.tsx` | Field config error |
| `components/work-items/file-upload.tsx` | File upload error |
| `components/work-items/attachments-list.tsx` | Attachments error |
| `components/staff-list-embedded.tsx` | Staff list error |
| `components/charts/chart-builder-drill-down.tsx` | Drill-down error |
| `components/charts/dashboard-states.tsx` | Dashboard error state |
| `components/charts/dashboard-preview.tsx` | Preview error |

#### Info Alerts (Blue) - 11+ instances

| File | Context |
|------|---------|
| `components/auth/mfa-setup-dialog.tsx` | MFA setup info (2 instances) |
| `components/auth/mfa-verify-dialog.tsx` | MFA verify info |
| `components/introspect-data-source-modal.tsx` | Introspection info |
| `components/transition-action-builder.tsx` | Workflow info |
| `components/charts/dashboard-view.tsx` | Dashboard info |
| `components/charts/chart-builder-core.tsx` | Chart builder info (2 instances) |
| `app/(default)/admin/report-card/report-card-admin.tsx` | Report card info |
| `app/(default)/configure/practices/practices-content.tsx` | Practices info |

#### Warning Alerts (Yellow/Amber) - 3+ instances

| File | Context |
|------|---------|
| `components/delete-data-source-column-modal.tsx` | Deletion warning |
| `components/csv-preview-table.tsx` | Import warning |
| `app/(default)/configure/practices/[id]/sections/ratings-integration-section.tsx` | Integration warning |

#### Success Alerts (Green) - 3+ instances

| File | Context |
|------|---------|
| `components/work-items/file-upload.tsx` | Upload success |

**Excluded from Count** (appropriate as-is):
- `/templates/*/` - External templates with different design systems
- `/app/(alternative)/components-library/` - Demo/documentation pages
- `/docs/` - Documentation files
- Avatar notification dots (different pattern - status indicators, not alerts)
- Error boundary components (use ErrorDisplay correctly)

---

## Proposed Solution

### Phase 1: Create InlineAlert Component

Create `/components/ui/inline-alert.tsx`:

```typescript
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

const ALERT_STYLES: Record<InlineAlertType, {
  container: string;
  icon: string;
  title: string;
  text: string;
  IconComponent: typeof AlertCircle;
}> = {
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
    <div
      role="alert"
      className={`border rounded-lg p-4 ${styles.container} ${className}`}
    >
      <div className="flex items-start gap-3">
        <IconComponent className={`w-5 h-5 flex-shrink-0 mt-0.5 ${styles.icon}`} />
        <div className="flex-1 min-w-0">
          {title && (
            <h4 className={`font-medium ${styles.title}`}>{title}</h4>
          )}
          <div className={`text-sm ${title ? 'mt-1' : ''} ${styles.text}`}>
            {children}
          </div>
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
```

**Usage**:

```tsx
import { InlineAlert } from '@/components/ui/inline-alert';

// Error alert
<InlineAlert type="error" title="Upload Failed">
  The file could not be uploaded. Please try again.
</InlineAlert>

// Info alert (no title)
<InlineAlert type="info">
  Enable MFA for enhanced security.
</InlineAlert>

// Dismissible warning
<InlineAlert type="warning" onDismiss={() => setShowWarning(false)}>
  This action cannot be undone.
</InlineAlert>
```

### Phase 2: Unify Command Center Toast

Migrate `/app/(default)/admin/command-center/components/toast.tsx` to use main toast:

1. Remove local `ToastProvider` from command center page
2. Update imports from local toast to `@/components/toast`
3. Delete duplicate toast file
4. Update any style differences if needed

**Files to Modify**:
- `/app/(default)/admin/command-center/page.tsx` - Remove local ToastProvider
- `/app/(default)/admin/command-center/components/redis-key-inspector.tsx` - Update import
- `/app/(default)/admin/command-center/components/redis-purge-tools.tsx` - Update import
- `/app/(default)/admin/command-center/components/user-detail-modal.tsx` - Update import

**File to Delete**:
- `/app/(default)/admin/command-center/components/toast.tsx`

### Phase 3: Migrate Inline Alerts to InlineAlert Component

Migrate files in priority order:

#### High Priority (Core App Functionality)

| File | Instances | Estimated Effort |
|------|-----------|------------------|
| `components/charts/dashboard-states.tsx` | 1 | Low |
| `components/charts/dashboard-preview.tsx` | 1 | Low |
| `components/charts/chart-builder-core.tsx` | 2 | Low |
| `components/charts/chart-builder-drill-down.tsx` | 1 | Low |
| `components/auth/mfa-setup-dialog.tsx` | 2 | Low |
| `components/auth/mfa-verify-dialog.tsx` | 1 | Low |
| `app/(default)/data/explorer/page.tsx` | 2 | Low |

#### Medium Priority (Configuration/Admin)

| File | Instances | Estimated Effort |
|------|-----------|------------------|
| `app/(default)/admin/command-center/page.tsx` | 1 | Low |
| `app/(default)/admin/command-center/components/*.tsx` | 3 | Low |
| `app/(default)/admin/report-card/report-card-admin.tsx` | 1 | Low |
| `app/(default)/configure/practices/practices-content.tsx` | 1 | Low |
| `app/(default)/configure/practices/[id]/sections/ratings-integration-section.tsx` | 1 | Low |

#### Lower Priority (Specialized Components)

| File | Instances | Estimated Effort |
|------|-----------|------------------|
| `components/attachment-field-renderer.tsx` | 2 | Low |
| `components/work-item-field-config.tsx` | 1 | Low |
| `components/work-items/file-upload.tsx` | 2 | Low |
| `components/work-items/attachments-list.tsx` | 1 | Low |
| `components/csv-preview-table.tsx` | 1 | Low |
| `components/delete-data-source-column-modal.tsx` | 1 | Low |
| `components/introspect-data-source-modal.tsx` | 1 | Low |
| `components/transition-action-builder.tsx` | 1 | Low |
| `components/staff-list-embedded.tsx` | 1 | Low |
| `components/charts/dashboard-view.tsx` | 1 | Low |

---

## Decision: ErrorDisplay vs InlineAlert

**Question**: Should we use existing `ErrorDisplay variant="inline"` or create new `InlineAlert`?

**Analysis**:

| Aspect | ErrorDisplay (inline) | New InlineAlert |
|--------|----------------------|-----------------|
| Purpose | Error states with retry | General alerts (info, warning, success, error) |
| Types supported | Error only | All 4 types |
| Features | Retry button, back link | Dismissible, simple content |
| Complexity | High (error translation, dev details) | Low (just content) |
| Import size | Large (597 lines total) | Small (~80 lines) |

**Recommendation**: Create `InlineAlert` for these reasons:

1. **Type coverage**: ErrorDisplay only handles errors; we need info/warning/success too
2. **Simplicity**: Many inline alerts are just informational, don't need retry/translation
3. **Bundle size**: InlineAlert is much smaller for simple use cases
4. **Separation of concerns**: ErrorDisplay for errors, InlineAlert for general messages

**Keep ErrorDisplay for**:
- Error boundaries
- API/Query error states that need retry
- Complex error handling with user-friendly messages

**Use InlineAlert for**:
- Informational messages
- Warnings about actions
- Success confirmations
- Simple error messages without retry

---

## Implementation Status (Completed December 2024)

### Phase 1: InlineAlert Component - COMPLETED
- Created `/components/ui/inline-alert.tsx` with 4 types (error, warning, success, info)
- Supports title, children, onDismiss, and className props
- Full dark mode support
- Memoized for performance

### Phase 2: Command Center Toast Unification - COMPLETED
- Deleted duplicate `/app/(default)/admin/command-center/components/toast.tsx`
- Updated 4 files to use `@/components/toast`
- Removed local ToastProvider wrapper

### Phase 3: Inline Alert Migration - COMPLETED
Migrated 17 files to use InlineAlert component:
- `app/(default)/data/explorer/page.tsx` - Error alerts
- `app/(default)/admin/command-center/page.tsx` - Error alert
- `app/(default)/admin/command-center/components/at-risk-users-panel.tsx` - Error alert
- `app/(default)/admin/command-center/components/security-events-feed.tsx` - Error alert
- `app/(default)/admin/command-center/components/redis-purge-tools.tsx` - Warning alert
- `app/(default)/configure/practices/[id]/sections/ratings-integration-section.tsx` - Warning alert
- `components/work-item-field-config.tsx` - Error alert
- `components/work-items/attachments-list.tsx` - Error alert
- `components/work-items/file-upload.tsx` - Error and success alerts
- `components/staff-list-embedded.tsx` - Error alert
- `components/charts/chart-builder-drill-down.tsx` - Error alert
- `components/charts/dashboard-preview.tsx` - Error alert
- `components/attachment-field-renderer.tsx` - Error alert
- `components/csv-preview-table.tsx` - Warning alert
- `components/delete-data-source-column-modal.tsx` - Warning alert
- `components/introspect-data-source-modal.tsx` - Info alert

### Approved Exceptions (Not Migrated)
The following files intentionally retain inline alert patterns due to specialized requirements:

| File | Reason |
|------|--------|
| `components/auth/mfa-setup-dialog.tsx` | MFA flow with custom icons, multiple step-specific info boxes, tightly integrated with dialog UX |
| `components/auth/mfa-verify-dialog.tsx` | MFA verification with custom icon and loading state integration |
| `components/transition-action-builder.tsx` | Collapsible help section with interactive content (expand/collapse, token grid) |
| `components/charts/dashboard-view.tsx` | Dev-only performance metrics with refresh button and stats display |
| `components/charts/chart-builder-core.tsx` | Form contextual help messages tied to form controls (table mode, multiple series, stacked bars, dual-axis) |
| `components/charts/dashboard-states.tsx` | Specialized error component with retry button (uses DashboardErrorState) |
| `app/(default)/configure/practices/practices-content.tsx` | Session expiry loading state with Spinner (transitional state, not alert) |
| `app/(default)/admin/report-card/report-card-admin.tsx` | Filter criteria info box with custom Filter icon and inline code examples |

---

## Success Criteria

1. **InlineAlert component created** with 4 types (error, warning, success, info)
2. **Command Center toast unified** with main toast system
3. **17 inline alert implementations migrated** to InlineAlert component
4. **8 specialized patterns documented as approved exceptions**
5. **No regression** in existing functionality
6. **`pnpm tsc && pnpm lint` pass**
7. **Consistent dark mode support** across all alerts

---

## Estimated Effort

| Phase | Tasks | Effort |
|-------|-------|--------|
| Phase 1 | Create InlineAlert component | 1 hour |
| Phase 2 | Unify Command Center toast | 30 minutes |
| Phase 3 | Migrate 45+ inline alerts | 3-4 hours |
| Testing | Verify all changes | 1 hour |
| **Total** | | **5-6 hours** |

---

## Files Summary

### New Files
- `/components/ui/inline-alert.tsx`

### Modified Files (~50 files)
- Phase 2: 5 files (command center toast unification)
- Phase 3: 45+ files (inline alert migration)

### Deleted Files
- `/app/(default)/admin/command-center/components/toast.tsx`

---

## Related Documentation

- [Toast Unification Plan](/docs/plans/toast-unification.md) - Existing plan for toast consolidation
- [Component Refactor](/docs/refactoring/component-refactor.md) - Main refactoring document

---

## Appendix: Full File List with Inline Alerts

### Red (Error) Alerts - 25 files

```
app/(default)/data/explorer/page.tsx:177
app/(default)/data/explorer/page.tsx:203
app/(default)/admin/command-center/page.tsx:199
app/(default)/admin/command-center/components/at-risk-users-panel.tsx:249
app/(default)/admin/command-center/components/redis-purge-tools.tsx:71
app/(default)/admin/command-center/components/security-events-feed.tsx:188
components/attachment-field-renderer.tsx:408
components/work-item-field-config.tsx:189
components/work-items/file-upload.tsx:150
components/work-items/attachments-list.tsx:67
components/staff-list-embedded.tsx:75
components/charts/chart-builder-drill-down.tsx:251
components/charts/dashboard-states.tsx:105
components/charts/dashboard-preview.tsx:222
components/error-display.tsx:406 (internal - keep as-is)
components/error-display.tsx:474 (internal - keep as-is)
```

### Blue (Info) Alerts - 11 files

```
components/auth/mfa-setup-dialog.tsx:310
components/auth/mfa-setup-dialog.tsx:401
components/auth/mfa-verify-dialog.tsx:187
components/introspect-data-source-modal.tsx:107
components/transition-action-builder.tsx:511
components/charts/dashboard-view.tsx:269
components/charts/chart-builder-core.tsx:297
components/charts/chart-builder-core.tsx:547
app/(default)/admin/report-card/report-card-admin.tsx:373
app/(default)/configure/practices/practices-content.tsx:287
components/attachment-field-renderer.tsx:384
```

### Yellow (Warning) Alerts - 3 files

```
components/delete-data-source-column-modal.tsx:106
components/csv-preview-table.tsx:196
app/(default)/configure/practices/[id]/sections/ratings-integration-section.tsx:169
```

### Green (Success) Alerts - 1 file

```
components/work-items/file-upload.tsx:156
```
