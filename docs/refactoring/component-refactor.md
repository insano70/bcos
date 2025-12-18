# UI Component Drift Analysis & Refactoring Plan

> **Generated**: December 2024
> **Purpose**: Identify UI components with inconsistent implementations that would benefit from standardization
> **Context**: Similar to the spinner component drift discovered (20+ implementations), this analysis covers all major UI patterns

---

## Executive Summary

A comprehensive analysis of the codebase examined **16 UI pattern categories** across **500+ component files**. This analysis reveals **significant component standardization drift** where visually and functionally similar components have divergent implementations.

### Key Metrics

| Metric | Count | Status |
|--------|-------|--------|
| Total UI patterns analyzed | 16 categories | - |
| Components with drift issues | 500+ files | In Progress |
| Inline badge implementations | 438+ | Pending |
| ~~Button variants without component~~ | ~~197+~~ | ✅ Done |
| Modal/dialog files | 57+ | Pending |
| Unique icon size combinations | 15+ | Pending |

### Completed Work

- **Button Component** (December 2024): Created `/components/ui/button.tsx` with 9 variants, 4 sizes, loading states, icon support, and accessibility features. 60+ files migrated.

---

## Table of Contents

1. [Buttons](#1-buttons---completed-) ✅
2. [Modals/Dialogs](#2-modalsdialogs---completed-) ✅
3. [Badges/Status Indicators](#3-badgesstatus-indicators---438-inline-implementations)
4. [Loading/Skeleton States](#4-loadingskeleton-states---completed-) ✅
5. [Form Fields](#5-form-fields---completed-) ✅
6. [Cards/Panels](#6-cardspanels---completed-) ✅
7. [Empty/Error States](#7-emptyerror-states---inconsistent-cta-buttons)
8. [Tables](#8-tables---completed-) ✅
9. [Avatars](#9-avatars---completed-) ✅
10. [Tooltips/Popovers](#10-tooltipspopovers---completed-partial) (Partial)
11. [Navigation/Tabs](#11-navigationtabs---completed-) ✅
12. [Icons](#12-icons---deferred-) ⏸️ Deferred
13. [Alerts/Toasts](#13-alertstoasts---legacy-hook-conflict)
14. [Typography](#14-typography---completed-) ✅
15. [Pagination](#15-pagination---completed-) ✅
16. [List Items](#16-list-items---spacing-inconsistency)
17. [Dead Code to Remove](#17-dead-code-to-remove)
18. [Recommended Priority](#18-recommended-standardization-priority)

---

## 1. Buttons - COMPLETED ✅

**Severity: CRITICAL** | **Files Affected: 197+** | **Effort: High** | **Status: COMPLETE (December 2024)**

### Solution Implemented

A standardized `Button` component was created at `/components/ui/button.tsx` with the following features:

#### Variants
| Variant | Description |
|---------|-------------|
| `primary` | Dark button (gray-900/gray-100 inverted for dark mode) |
| `secondary` | Border button with gray text |
| `danger` | Red solid button for destructive actions |
| `danger-outline` | Red text with border |
| `blue` | Blue solid button |
| `violet` | Violet/purple solid button (brand color) |
| `ghost` | Transparent with hover state |
| `success` | Green/emerald solid button |
| `blue-outline` | Blue text with border |

#### Sizes
| Size | Padding |
|------|---------|
| `xs` | `px-2 py-0.5 text-xs` |
| `sm` | `px-2 py-1 text-sm` |
| `md` | `px-3 py-2 text-sm` (default) |
| `lg` | `px-4 py-3 text-sm` |

#### Features
- **Loading states**: `loading` and `loadingText` props with integrated Spinner
- **Icons**: `leftIcon` and `rightIcon` props
- **Full width**: `fullWidth` prop
- **Accessibility**: Focus rings on all variants, `aria-busy` during loading
- **forwardRef**: Proper ref forwarding for form integration

### Migration Status

**60+ files** now import and use the standard Button component.

### Approved Exceptions (Do NOT migrate)

| Category | Reason |
|----------|--------|
| **HeadlessUI components** (`MenuButton`, `PopoverButton`, `MenuItem`) | Must use inline `className` by design |
| **Link components in server components** (e.g., `dashboard/page.tsx`) | Server components cannot use client Button |
| **Small utility/icon buttons** | Minimal styling appropriate for context (close X, toggles, toolbar icons) |
| **Demo/component library pages** (`app/(alternative)/components-library/`) | Documentation/demo purposes |
| **Template components** (`templates/*/`) | External templates with different design requirements |

### Original Problem (Resolved)

Prior to standardization, 197+ button instances used inline Tailwind classes with duplicated patterns:
- 6+ primary dark button patterns
- 8+ secondary border button patterns
- 4+ blue action button patterns
- 3+ destructive button patterns
- Inconsistent loading states (different spinner sizes, text patterns)
- 97% of buttons missing focus rings (accessibility violation)

### Key Files Migrated

The following high-traffic files were migrated to use the standard Button component:
- All modal components (crud-modal, delete-confirmation-modal, etc.)
- Authentication forms (login-form, mfa-setup-dialog, mfa-verify-dialog)
- Configuration pages (users, organizations, practices, work-item-types, etc.)
- Work item components (work-item-watch-button, pagination-classic)
- Admin components (redis-purge-tools, redis-key-browser, analytics-cache-dashboard)
- Data explorer pages and components

---

## 2. Modals/Dialogs - COMPLETED ✅

**Severity: CRITICAL** | **Files Affected: 57+** | **Effort: High** | **Status: COMPLETE (December 2024)**

### Solution Implemented

A standardized `Modal` component was created at `/components/ui/modal.tsx` with the following features:

#### Size Presets
| Size | Width | Use Case |
|------|-------|----------|
| `sm` | `max-w-md` (448px) | Confirmations, small forms |
| `md` | `max-w-lg` (512px) | Default |
| `lg` | `max-w-2xl` (672px) | Forms with more fields |
| `xl` | `max-w-4xl` (896px) | Data views, tables |
| `full` | `max-w-6xl` (1152px) | Complex visualizations |

#### Props Interface
- `isOpen`, `onClose` - Modal state control
- `size` - Size preset (sm, md, lg, xl, full)
- `title`, `description` - Optional header with close button
- `showCloseButton` - Manual close button control
- `preventClose` - Disable close on backdrop/escape (for progress modals)
- `className`, `contentClassName` - Panel and content styling
- `containerClassName` - Container positioning (for top-aligned modals)

#### Migration Results
- **18/21 files migrated** to use the unified Modal component
- **3 base components** (`ModalBasic`, `ModalBlank`, `ModalAction`) refactored to use Modal internally with `@deprecated` tags
- **3 valid exceptions** kept for unique UX requirements (see below)

### Approved Exceptions (Not Migrated)

| File | Reason |
|------|--------|
| `mfa-setup-dialog.tsx` | Auth UX: scale animation, backdrop blur, shield icon header |
| `mfa-verify-dialog.tsx` | Auth UX: scale animation, backdrop blur, multi-step state machine |
| `user-announcement-modal.tsx` | Custom gradient accent bar, backdrop blur, tabbed interface |

### Original Problem (Resolved)

- **3 overlapping base components** with nearly identical code (`ModalBasic`, `ModalBlank`, `ModalAction`)
- **21 files implement Dialog from scratch** - duplicating ~25 lines of boilerplate each
- **Fixed size limitation** - all base components hardcoded to `max-w-lg`, forcing developers to bypass them
- **CrudModal is excellent** - remains unchanged for CRUD form operations

### Analysis Results

#### Size Distribution (Actual Usage)

| Size | Width | Count | Examples |
|------|-------|-------|----------|
| `max-w-md` | 448px | 5 | Confirmations, delete modals |
| `max-w-lg` | 512px | 7 | Default (base components), MFA dialogs |
| `max-w-2xl` | 672px | 4 | Work item modals, search |
| `max-w-3xl` | 768px | 1 | Feedback modal |
| `max-w-4xl` | 896px | 5 | SQL view, schema instructions |
| `max-w-5xl` | 1024px | 1 | Organization users table |
| `max-w-6xl` | 1152px | 3 | Workflow visualization, results |

**Not used**: `sm`, `xl`, `7xl`

#### Files Implementing Dialog From Scratch (21 files)

These duplicate Headless UI Dialog/Transition boilerplate instead of using a base:

| File | Size Used | Reason |
|------|-----------|--------|
| `edit-work-item-modal.tsx` | `max-w-2xl` | Base only supports `max-w-lg` |
| `schema-instructions-modal.tsx` | `max-w-4xl` | Base only supports `max-w-lg` |
| `view-sql-modal.tsx` | `max-w-4xl` | Base only supports `max-w-lg` |
| `view-results-modal.tsx` | `max-w-6xl` | Base only supports `max-w-lg` |
| `view-columns-modal.tsx` | `max-w-4xl` | Base only supports `max-w-lg` |
| `discovery-progress-modal.tsx` | `max-w-md` | Base only supports `max-w-lg` |
| `workflow-visualization-modal.tsx` | `max-w-6xl` | Base only supports `max-w-lg` |
| `manage-statuses-modal.tsx` | `max-w-4xl` | Base only supports `max-w-lg` |
| `edit-transition-config-modal.tsx` | `max-w-6xl` | Base only supports `max-w-lg` |
| `organization-users-modal.tsx` | `max-w-5xl` | Base only supports `max-w-lg` |
| `add-work-item-modal.tsx` | `max-w-2xl` | Base only supports `max-w-lg` |
| `recipients-modal.tsx` | `max-w-lg` | Custom header layout |
| `user-announcement-modal.tsx` | `max-w-2xl` | Custom styling |
| `introspect-data-source-modal.tsx` | `max-w-md` | Base only supports `max-w-lg` |
| `data-source-connection-test-modal.tsx` | `max-w-lg` | Custom layout |
| `delete-data-source-column-modal.tsx` | `max-w-md` | Base only supports `max-w-lg` |
| `delete-data-source-modal.tsx` | `max-w-md` | Base only supports `max-w-lg` |
| `add-practice-modal.tsx` | `max-w-md` | Base only supports `max-w-lg` |
| `search-modal.tsx` | `max-w-2xl` | Special keyboard handling |
| `mfa-setup-dialog.tsx` | `max-w-lg` | Different animation |
| `mfa-verify-dialog.tsx` | `max-w-lg` | Different animation |

**Total duplicated boilerplate: ~525 lines across 21 files**

#### Current Base Components (To Be Consolidated)

| Component | Header | Close Button | Size | Differences |
|-----------|--------|--------------|------|-------------|
| `ModalBasic` | Yes (title) | In header | `max-w-lg` fixed | Standard |
| `ModalBlank` | No | None | `max-w-lg` fixed | Children only |
| `ModalAction` | No | In content | `max-w-lg` fixed | Adds `p-6` padding |

### Solution: Unified Modal Component

Create `/components/ui/modal.tsx` with 5 practical sizes:

```tsx
const MODAL_SIZES = {
  sm: 'max-w-md',    // 448px - Confirmations, small forms
  md: 'max-w-lg',    // 512px - Default
  lg: 'max-w-2xl',   // 672px - Forms with more fields
  xl: 'max-w-4xl',   // 896px - Data views, tables
  full: 'max-w-6xl', // 1152px - Complex visualizations
} as const;

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;

  // Size
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';

  // Header configuration
  title?: string;           // If provided, renders header
  description?: string;     // Optional subtitle

  // Close button
  showCloseButton?: boolean;  // Default: true when title provided

  // Prevent close on backdrop click (for progress modals)
  preventClose?: boolean;

  className?: string;
}
```

#### Migration Mapping

| Current Usage | Migrates To |
|---------------|-------------|
| `ModalBasic` | `<Modal title="..." size="md">` |
| `ModalBlank` | `<Modal size="md">` |
| `ModalAction` | `<Modal size="md">` + manual padding |
| `max-w-md` modals | `<Modal size="sm">` |
| `max-w-2xl` modals | `<Modal size="lg">` |
| `max-w-3xl/4xl` modals | `<Modal size="xl">` |
| `max-w-5xl/6xl` modals | `<Modal size="full">` |
| **CrudModal** | **Keep as-is** (specialized for forms) |

#### Special Cases

| Category | Decision |
|----------|----------|
| **CrudModal** | Keep - well-designed for CRUD forms with validation |
| **Chart fullscreen modals** | Keep Framer Motion - specialized animations |
| **MFA dialogs** | Migrate but may keep distinct animation for auth UX |
| **DeleteConfirmationModal** | Update to use new Modal internally |

### Implementation Plan

#### Phase 1: Create Modal Component
1. Create `/components/ui/modal.tsx` with 5 size presets
2. Match standard animation timing from existing modals
3. Add accessibility features (focus trap, escape key, aria labels)

#### Phase 2: Update Base Components
1. Refactor `ModalBasic` to use new `Modal` internally
2. Refactor `ModalBlank` to use new `Modal` internally
3. Refactor `ModalAction` to use new `Modal` internally

#### Phase 3: Migrate Dialog-From-Scratch Files (21 files)
Priority order:
1. **High-traffic**: `edit-work-item-modal`, `add-work-item-modal`, `schema-instructions-modal`
2. **View modals**: `view-sql-modal`, `view-results-modal`, `view-columns-modal`
3. **Config modals**: `manage-statuses-modal`, `edit-transition-config-modal`
4. **Data source modals**: `introspect-data-source-modal`, `delete-data-source-*`
5. **Remaining modals**

### Expected Outcome

| Metric | Before | After |
|--------|--------|-------|
| Boilerplate lines | ~525 | ~0 |
| Base modal components | 3 | 1 (unified) |
| Files with raw Dialog | 21 | 0 |
| Supported sizes | 1 (fixed) | 5 presets |

---

## 3. Badges/Status Indicators - 438+ Inline Implementations

**Severity: HIGH** | **Files Affected: 50+** | **Effort: Medium**

### Problem Statement

No reusable Badge component exists. Status indicators are implemented inline with 438+ occurrences using varying patterns.

### Existing Badge Components (Only 3)

| Component | File | Purpose |
|-----------|------|---------|
| `ColorContrastBadge` | `/components/color-contrast-badge.tsx` | WCAG compliance status |
| `AnnouncementBadge` | `/components/announcements/announcement-badge.tsx` | Unread count |
| `CacheHealthBadge` | `/components/admin/command-center/cache-health-badge.tsx` | Cache status |

### Common Inline Patterns

#### Pattern 1: Standard Status Badge (Most Common - 90+ locations)
```tsx
className="px-2.5 py-0.5 rounded-full text-xs font-medium"
```

#### Pattern 2: Admin/Monitoring Badge
```tsx
className="px-2 py-0.5 rounded text-xs font-medium"  // Note: rounded, not rounded-full
```

#### Pattern 3: Larger Badge Variant
```tsx
className="px-2 py-1 rounded-full text-xs font-medium"
```

### Spacing Inconsistencies

| Padding | Occurrences | Files |
|---------|-------------|-------|
| `px-2.5 py-0.5` | Most common | Configure pages, dashboards |
| `px-2 py-0.5` | Admin panels | Command center |
| `px-2 py-1` | Larger variant | Organizations, users |
| `px-1.5` | Chart percentages | Component library |

### Color Opacity Variations

```tsx
// Pattern A: /20 opacity (most common)
className="bg-green-500/20 text-green-700"

// Pattern B: /30 opacity
className="bg-green-900/30 text-green-400"

// Pattern C: Solid colors (100 scale)
className="bg-green-100 text-green-800"
```

### Dark Mode Patterns (Inconsistent)

```tsx
// Pattern A
className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"

// Pattern B
className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300"
```

### Status Color Systems

#### Work Item Status
```tsx
const statusColors = {
  backlog: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};
```
**File**: `/components/manage-statuses-modal.tsx`

#### Cache Health Status
```tsx
const healthColors = {
  excellent: 'bg-green-50 text-green-800',
  good: 'bg-blue-50 text-blue-800',
  degraded: 'bg-yellow-50 text-yellow-800',
  stale: 'bg-orange-50 text-orange-800',
  cold: 'bg-red-50 text-red-800',
};
```
**File**: `/lib/monitoring/analytics-cache-health.ts`

#### Warming Job Status
```tsx
queued: 'text-gray-600 bg-gray-100 dark:bg-gray-700'
warming: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20'
completed: 'text-green-600 bg-green-50 dark:bg-green-900/20'
failed: 'text-red-600 bg-red-50 dark:bg-red-900/20'
```
**File**: `/components/admin/command-center/warming-job-list.tsx`

### Files with Heavy Badge Usage

**Configuration Pages**:
- `/app/(default)/configure/announcements/page.tsx` - Priority, target, status badges
- `/app/(default)/configure/charts/page.tsx` - Chart type, status badges
- `/app/(default)/configure/dashboards/page.tsx` - Chart count, status badges
- `/app/(default)/configure/data-sources/data-sources-content.tsx` - Column type badges
- `/app/(default)/configure/users/users-content.tsx` - MFA status, account status
- `/app/(default)/configure/organizations/organizations-content.tsx` - Active/inactive

**Admin Components**:
- `/app/(default)/admin/command-center/components/warming-job-list.tsx`
- `/app/(default)/admin/command-center/components/security-events-feed.tsx`
- `/app/(default)/admin/command-center/components/security-status-kpi.tsx`

**Data Tables**:
- `/components/accordion-table-item.tsx`
- `/components/data-table/data-table-row.tsx`
- `/components/editable-work-items-table.tsx`

### Recommended Solution

Create `/components/ui/badge.tsx`:

```tsx
interface BadgeProps {
  variant: 'status' | 'priority' | 'count' | 'type';
  color: 'gray' | 'green' | 'blue' | 'yellow' | 'orange' | 'red' | 'violet';
  size: 'sm' | 'md';
  children: ReactNode;
}

// Usage
<Badge variant="status" color="green">Active</Badge>
<Badge variant="count" color="red">5</Badge>
```

---

## 4. Loading/Skeleton States - COMPLETED ✅

**Severity: HIGH** | **Files Affected: 70+** | **Effort: Medium** | **Status: RESOLVED (December 2024)**

### Solution Implemented

The loading/skeleton system has been standardized on `animate-shimmer` across the codebase.

### Validated Findings (December 2024)

A comprehensive audit revealed the original analysis was outdated:

| Original Claim | Actual State | Resolution |
|----------------|--------------|------------|
| 22+ `animate-pulse` instances | **2 instances** (intentional) | No migration needed |
| ChartSkeleton naming conflict | **3 implementations, properly scoped** | Not a real conflict |
| LoadingSpinner duplicate | **1 actual usage** | Deprecated |

### Animation System (Standardized)

All skeleton components now use `animate-shimmer`:

```tsx
// Standard pattern - /components/ui/loading-skeleton.tsx
className="animate-shimmer bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200
           dark:from-slate-700 dark:via-slate-600 dark:to-slate-700
           bg-[length:200%_100%]"
```

**Components using standard animation**:
- `Skeleton`, `ChartSkeleton`, `TableSkeleton`, `CardSkeleton`, `FormSkeleton`, `DashboardSkeleton`
- Command center skeletons (`KPISkeleton`, `PanelSkeleton`, `ChartSkeleton`)
- Dimension comparison view skeleton

### Remaining `animate-pulse` Instances (Intentional)

Only 2 instances remain, both intentionally using pulse for **status indicators** (not loading states):

| File | Usage | Reason to Keep |
|------|-------|----------------|
| `/app/(default)/admin/command-center/components/redis-cache-stats.tsx:146` | Green pulsing dot for "Connected" status | Correct UX for live status |
| `/app/(default)/admin/command-center/components/warming-job-list.tsx:130` | Pulsing 🔥 emoji for active operations | Correct UX for activity indicator |

### ChartSkeleton - Not a Conflict

Three implementations exist with proper scoping:

| Location | Scope | Import Path |
|----------|-------|-------------|
| `/components/ui/loading-skeleton.tsx` | Global export | `@/components/ui/loading-skeleton` |
| `/app/(default)/admin/command-center/components/skeleton.tsx` | Local to command center | `./skeleton` |
| `/components/charts/dimension-comparison-view.tsx` | Local function (not exported) | N/A |

### LoadingSpinner - Deprecated

`LoadingSpinner` wrapper has been deprecated. Only 1 file used it:
- `/components/charts/historical-comparison-widget.tsx` → Migrated to use `Spinner` directly

### Spinner Size Presets (Reference)

```tsx
// /components/ui/spinner.tsx
export const SPINNER_SIZES = {
  sm: { sizeClass: 'w-4 h-4', borderClass: 'border-2' },    // 16x16 - buttons
  md: { sizeClass: 'w-8 h-8', borderClass: 'border-3' },    // 32x32 - content
  lg: { sizeClass: 'w-12 h-12', borderClass: 'border-4' },  // 48x48 - modals
  xl: { sizeClass: 'w-16 h-16', borderClass: 'border-4' },  // 64x64 - fullscreen
};
```

---

## 5. Form Fields - COMPLETED ✅

**Severity: HIGH** | **Files Affected: 20+** | **Effort: Medium** | **Status: COMPLETE (December 2024)**

### Solution Implemented

Standardized form field components were created at `/components/ui/`:

#### Components Created

| Component | File | Purpose |
|-----------|------|---------|
| `FormLabel` | `form-label.tsx` | Standardized label with required indicator (`{required && ' *'}`) |
| `FormError` | `form-error.tsx` | Error message with dark mode (`text-red-600 dark:text-red-400`) |
| `FormHelp` | `form-help.tsx` | Help text with consistent sizing (`text-xs text-gray-500`) |
| `FormField` | `form-field.tsx` | Composite wrapper combining label, input slot, error, help text |

#### Standard Patterns

```tsx
// FormLabel - consistent required indicator
<FormLabel htmlFor="email" required>Email Address</FormLabel>
// Renders: "Email Address *" with proper styling

// FormError - dark mode support, accessibility
<FormError>{errors.email?.message}</FormError>
// Renders with role="alert" and dark mode colors

// FormHelp - conditional help text
<FormHelp>Enter your email for account recovery</FormHelp>

// FormField - composite wrapper
<FormField label="Email" required error={errors.email?.message}>
  <input type="email" {...register('email')} />
</FormField>
```

### Migration Status

**27 files migrated** to use the standardized components:

| File | Components Used | Fields Migrated |
|------|-----------------|-----------------|
| `dynamic-field-renderer.tsx` | FormLabel, FormError, FormHelp | 7 field types (text, number, date, datetime, dropdown, checkbox, user_picker) |
| `format-specific-fields.tsx` | FormLabel, FormError, FormHelp | 5 specialized fields (URL, Email, Phone, Currency, Percentage) |
| `edit-work-item-modal.tsx` | FormLabel, FormError | 6 fields |
| `add-work-item-modal.tsx` | FormLabel, FormError | 7 fields |
| `staff-member-form.tsx` | FormLabel, FormError | 4 fields |
| `staff-member-form-modal.tsx` | FormLabel, FormError | 4 fields |
| `content-section.tsx` | FormError | 3 error messages |
| `practice-info-section.tsx` | FormLabel, FormError | 1 label + 2 error messages |
| `seo-section.tsx` | FormError | 2 error messages |
| `contact-info-section.tsx` | FormError | 7 error messages |
| `ratings-integration-section.tsx` | FormLabel | 1 required indicator |
| `attachment-field-renderer.tsx` | FormLabel | 1 required indicator |
| `hierarchy-select.tsx` | FormLabel | 1 label with required indicator |
| `work-item-expanded-row.tsx` | FormLabel | 1 custom field label |
| `feedback-modal.tsx` | FormLabel | 3 labels (feedback type, category, severity) |
| `manage-statuses-modal.tsx` | FormLabel, FormError | 4 fields with error messages |
| `role-selector.tsx` | FormLabel | 1 label with required indicator |
| `chart-builder-core.tsx` | FormLabel | 2 dual-axis measure labels |
| `user-picker.tsx` | Dark mode colors | 1 placeholder required indicator |
| `reset-password/page.tsx` | FormLabel | 1 email field label |
| `report-card-admin.tsx` | FormLabel | 1 filter criteria label |
| `confirm-modal.tsx` | FormLabel | 1 reason field label |
| `announcement-modal.tsx` | Dark mode colors | 2 error messages |
| `multi-select-field.tsx` | Dark mode colors | 1 error message |
| `drill-down-chart-selector.tsx` | Dark mode colors | 1 error message |
| `data-source-columns-content.tsx` | Dark mode colors | 1 error message |
| `data-sources-content.tsx` | Dark mode colors | 1 page-level error |

**Exceptions** (intentionally not migrated):
- `app/(alternative)/components-library/` - Demo pages showing various patterns
- `templates/` - External templates with different design requirements

### Benefits Achieved

| Metric | Before | After |
|--------|--------|-------|
| Required indicator patterns | 3 different | 1 standardized |
| Error message dark mode support | Inconsistent | All have `dark:text-red-400` |
| Accessibility | Inconsistent | FormError has `role="alert"` |
| Code duplication | High | Centralized in `/components/ui/` |

### Original Problem (Resolved)

CRUD modal fields were well-standardized, but standalone forms used 3 different patterns for required field indicators.

### CRUD Modal Field System (Standardized)

**Location**: `/components/crud-modal/`

**Field Types**:
| Component | File | Notes |
|-----------|------|-------|
| `TextField` | `text-field.tsx` | Standard text input |
| `EmailField` | `email-field.tsx` | Email input |
| `PasswordField` | `password-field.tsx` | Password input |
| `NumberField` | `number-field.tsx` | Number input |
| `TextareaField` | `textarea-field.tsx` | Multi-line text |
| `CheckboxField` | `checkbox-field.tsx` | Different layout (label after) |
| `SelectField` | `select-field.tsx` | Dropdown (not memoized) |
| `CustomField` | `custom-field.tsx` | Adapter for custom components |

**Standard Pattern**:
```tsx
// Label with programmatic asterisk
<label>{field.label}{field.required && ' *'}</label>

// Input with error styling
<input className={`${error ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'}`} />

// Error message
<p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>

// Help text
<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.helpText}</p>
```

### Required Indicator Variations

#### Pattern A: Programmatic (CRUD Modal - Correct)
```tsx
{field.label}{field.required && ' *'}
```
**Files**: All CRUD modal field components

#### Pattern B: Hardcoded in Label Text
```tsx
<label>Full Name *</label>
```
**Files**: `/components/staff-member-form.tsx`, `/components/staff-member-form-modal.tsx`

#### Pattern C: Separate Span Element
```tsx
<label>
  Field Label
  <span className="text-red-500 ml-1">*</span>
</label>
```
**Files**: `/app/(default)/configure/practices/[id]/sections/ratings-integration-section.tsx`

### Error Message Variations

| Pattern | Text Size | Color | Dark Mode | Files |
|---------|-----------|-------|-----------|-------|
| Standard | `text-sm` | `text-red-600` | `dark:text-red-400` | CRUD fields, login-form |
| Variant A | `text-xs` | `text-red-600` | Missing | dynamic-field-renderer |
| Variant B | `text-sm` | `text-red-500` | Missing | multi-select-field |
| Variant C | `text-sm` | `text-red-600` | Present | staff-member-form-modal |

### Label Styling Variations

```tsx
// Most common (CRUD modal)
className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"

// Login form (tighter spacing)
className="block text-sm font-medium mb-1"  // Missing color classes

// Some inputs (no label)
// DateInput, MultiSelectField - caller must provide label
```

### Help Text Sizing Inconsistency

| Location | Size | Margin |
|----------|------|--------|
| CRUD Modal | `text-xs` | `mt-1` |
| Ratings Section | `text-xs` | `mt-2` |
| SpecialtiesInput | `text-sm` | `mt-1` |

### Checkbox Layout Difference

**Standard fields**: Label BEFORE input
```tsx
<label>Field Label</label>
<input type="text" />
```

**Checkbox fields**: Label AFTER input
```tsx
<div className="flex items-center">
  <input type="checkbox" />
  <label className="ml-2">Checkbox Label</label>
</div>
```

### Files Requiring Standardization

**Standalone Forms** (not using CRUD modal):
- `/components/auth/login-form.tsx`
- `/components/staff-member-form.tsx`
- `/components/staff-member-form-modal.tsx`
- `/app/(default)/configure/practices/[id]/sections/practice-info-section.tsx`
- `/app/(default)/configure/practices/[id]/sections/contact-info-section.tsx`
- `/app/(default)/configure/practices/[id]/sections/ratings-integration-section.tsx`

**Custom Input Components**:
- `/components/specialties-input.tsx`
- `/components/education-input.tsx`
- `/components/inputs/date-input.tsx`
- `/components/work-items/multi-select-field.tsx`

### Recommended Solution

Create `/components/ui/form-field.tsx`:

```tsx
interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  helpText?: string;
  children: ReactNode;
}

// For standalone forms that don't use CrudModal
<FormField label="Email" required error={errors.email}>
  <input type="email" {...register('email')} />
</FormField>
```

---

## 6. Cards/Panels - COMPLETED ✅

**Severity: MEDIUM** | **Files Affected: 50+** | **Effort: Medium** | **Status: COMPLETE (December 2024)**

### Solution Implemented

A standardized `Card` component was created at `/components/ui/card.tsx` with the following features:

#### Variants
| Variant | Light Mode | Dark Mode | Use Case |
|---------|------------|-----------|----------|
| `default` | `bg-white` | `bg-gray-800` | Standard card styling |
| `elevated` | `bg-white` | `bg-gray-800` | Cards with more visual emphasis |

#### Padding Presets
| Size | Value | Use Case |
|------|-------|----------|
| `none` | `p-0` | Custom layouts |
| `sm` | `p-4` | Compact cards, stat boxes |
| `md` | `p-6` | Standard cards (default) |
| `lg` | `p-8` | Prominent cards |

#### Border Radius Presets
| Size | Value | Use Case |
|------|-------|----------|
| `lg` | `rounded-lg` | Compact stat boxes |
| `xl` | `rounded-xl` | Standard cards (default) |
| `2xl` | `rounded-2xl` | Larger cards |

#### Shadow Presets
| Size | Value | Use Case |
|------|-------|----------|
| `none` | No shadow | Flat UI, nested cards |
| `sm` | `shadow-sm` | Standard elevation (default) |
| `md` | `shadow-md` | Medium elevation |
| `lg` | `shadow-lg` | High elevation |

#### SubComponents
- `CardHeader` - Header with border
- `CardContent` - Main content area
- `CardFooter` - Footer with border

### Migration Status

**Total Files Using Card Component: 32 files**

**Admin Panel Components (19 files)** - MIGRATED ✅
- `error-log-panel.tsx`, `at-risk-users-panel.tsx`, `error-rate-kpi.tsx`
- `response-time-kpi.tsx`, `system-health-kpi.tsx`, `active-users-kpi.tsx`
- `analytics-performance-kpi.tsx`, `security-events-feed.tsx`, `security-status-kpi.tsx`
- `slow-queries-panel.tsx`, `redis-cache-stats.tsx`, `error-rate-chart.tsx`
- `performance-chart.tsx`, `endpoint-performance-table.tsx`, `base-time-series-chart.tsx`
- `redis-admin-tabs.tsx`, `skeleton.tsx`, `analytics-cache-dashboard.tsx`

**Practice Configuration Sections (9 files)** - MIGRATED ✅
- `practice-info-section.tsx`, `contact-info-section.tsx`, `seo-section.tsx`
- `content-section.tsx`, `branding-section.tsx`, `services-conditions-section.tsx`
- `staff-section.tsx`, `business-hours-section.tsx`, `ratings-integration-section.tsx`

**Configure Dashboard (1 file)** - MIGRATED ✅
- `app/(default)/configure/page.tsx` - Stats cards and quick action cards

**Settings Pages (2 files)** - MIGRATED ✅
- `app/(default)/settings/account/page.tsx`
- `app/(default)/settings/appearance/page.tsx`

**Data Explorer Pages (1 file)** - MIGRATED ✅
- `app/(default)/data/explorer/suggestions/page.tsx` - Statistics cards and suggestion items

**Loading States (1 file)** - MIGRATED ✅
- `app/(default)/work/loading.tsx` - Table skeleton wrapper

**Report Card Components (10 files)** - KEPT AS-IS
- These components use `motion.div` with framer-motion animations
- Converting would require wrapping Card in motion.div, adding DOM complexity
- Files: `overall-score-card.tsx`, `insights-panel.tsx`, `trend-chart.tsx`, `engagement-card.tsx`, `measure-breakdown.tsx`, `peer-comparison.tsx`, `location-comparison.tsx`, `grade-history-table.tsx`, `month-selector.tsx`, `score-help-tooltip.tsx`

### Usage Examples

```tsx
import { Card } from '@/components/ui/card';

// Standard admin card
<Card>
  <h3>Title</h3>
  <p>Content</p>
</Card>

// Compact stat box
<Card radius="lg" shadow="none" padding="sm">
  <div className="text-xs">Data Sources</div>
  <div className="text-2xl font-bold">{count}</div>
</Card>

// Chart with fixed height
<Card className="flex flex-col" style={{ height: `${height}px` }}>
  <canvas ref={canvasRef} />
</Card>
```

### Original Problem (Resolved)

Prior to standardization, cards used varying patterns:
- Border radius: `rounded-lg`, `rounded-xl`, `rounded-2xl` with no clear hierarchy
- Shadows: `shadow-sm` through `shadow-2xl` inconsistently applied
- Color palettes: Mix of `gray-*` and `slate-*` scales
- Structure: No consistent pattern for header/content/footer

### Remaining Inline Patterns (Approved Exceptions)

| Category | Reason |
|----------|--------|
| **Report card components** | Use `motion.div` for framer-motion entry animations |
| **GlassCard usage** | Specialized glassmorphism effect with blur (batch-chart-renderer.tsx) |
| **Custom gradient cards** | Overall score card with dynamic gradients |
| **Dropdown/Popover panels** | Headless UI components with floating panels, different pattern |
| **Modal DialogPanel** | Headless UI Dialog pattern with transitions |
| **ErrorDisplay component** | Specialized component with own variants (full-page, card, inline, alert) |
| **Components inside modals** | Already within dialog context |
| **Chart placeholders** | dashboard-preview.tsx uses inline styles to match GlassCard/chart styling, uses `border-dashed` |
| **Chart components with animations** | Similar to report cards, use motion.div |

### Full Code Audit (December 2024)

A comprehensive audit identified 87 files with card-like patterns (`bg-white dark:bg-gray-800.*rounded`). After analysis:

- **32 files**: Now using Card component (including migrations above)
- **~10 files**: Report card components (motion.div, kept as-is)
- **~20 files**: Dropdown/popover components (different pattern, exception)
- **~15 files**: Modal components (dialog pattern, exception)
- **~10 files**: Other specialized components (ErrorDisplay, sidebar, etc.)

---

## 7. Empty/Error States - Inconsistent CTA Buttons

**Severity: MEDIUM** | **Files Affected: 30+** | **Effort: Low**

### Problem Statement

The ErrorDisplay system is well-designed, but retry/action buttons use inconsistent colors and labels.

### Core Error Components

| Component | File | Purpose |
|-----------|------|---------|
| `ErrorDisplay` | `/components/error-display.tsx` | 4 variants (full-page, card, inline, alert) |
| `ChartError` | `/components/charts/chart-error.tsx` | Chart-specific errors |
| `ChartErrorBoundary` | `/components/charts/chart-error-boundary.tsx` | React error boundary |
| `PageErrorBoundary` | `/components/page-error-boundary.tsx` | Page-level boundary |

### Retry Button Color Variations

| Component | Button Color | Label |
|-----------|--------------|-------|
| `ErrorDisplay` (primary) | `bg-violet-600 hover:bg-violet-700` | "Try Again" |
| `ErrorDisplay` (alert variant) | `bg-red-600 hover:bg-red-700` | "Try Again" |
| `ChartError` | `bg-gray-900 dark:bg-gray-100` | "Try Again" |
| `DashboardErrorState` | `bg-red-600 hover:bg-red-700` | "Retry" |
| `DashboardLoadingState` | N/A | N/A |
| 404 page | `bg-blue-600` | "Sign In" |
| Work item error | `text-red-600` (link style) | "Back to work items" |

### Button Label Inconsistency

- "Try Again" - ErrorDisplay, ChartError
- "Retry" - DashboardErrorState
- Navigation labels vary per context

### Empty State Icon Variations

| Component | Icon Type | Example |
|-----------|-----------|---------|
| `DashboardEmptyState` | Emoji | 📊 |
| DataTable empty | Custom prop (ReactNode) | Varies |
| Chart placeholder | Lucide icon | `RotateCcw` |

### Files with Error/Empty States

**Core**:
- `/components/error-display.tsx`
- `/components/charts/chart-error.tsx`
- `/components/charts/dashboard-states.tsx`
- `/components/data-table/base-data-table.tsx`

**Page-level**:
- `/app/not-found.tsx`
- `/app/(default)/work/[id]/work-item-detail-content.tsx`
- `/app/(default)/dashboard/view/[dashboardId]/page.tsx`

### Recommended Solution

1. Standardize retry button color to `bg-violet-600` (brand color)
2. Standardize label to "Try Again"
3. Create `<EmptyState icon={} title="" description="" action={} />` component

---

## 8. Tables - COMPLETED ✅

**Severity: MEDIUM** | **Files Affected: 17+** | **Effort: Low** | **Status: COMPLETE (December 2024)**

### Solution Implemented

The table color palette has been standardized across all components:

1. **GradeHistoryTable**: Migrated from `slate-*` to `gray-*` color palette (~40 class changes)
2. **DataTable rows**: Added hover states (`hover:bg-gray-50 dark:hover:bg-gray-700/30`)
3. **Header backgrounds**: Standardized to `bg-gray-50 dark:bg-gray-900/20` across all tables
4. **Divider colors**: Standardized to `divide-gray-100 dark:divide-gray-700/60`

See [table-color-standardization-plan.md](table-color-standardization-plan.md) for full implementation details.

### Original Problem (Resolved)

The main DataTable system was consistent, but `GradeHistoryTable` used a different color palette.

### DataTable System (Consistent)

**Files**:
- `/components/data-table/base-data-table.tsx`
- `/components/data-table/data-table-header.tsx`
- `/components/data-table/data-table-row.tsx`
- `/components/data-table-standard.tsx`
- `/components/editable-data-table.tsx`

**Standard Styling**:
```tsx
// Container
className="bg-white dark:bg-gray-800 shadow-sm rounded-xl"

// Header
className="bg-gray-50 dark:bg-gray-900/20 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400"

// Rows
className="divide-y divide-gray-100 dark:divide-gray-700/60"

// Cells
className="px-2 first:pl-5 last:pr-5 py-3"
```

### GradeHistoryTable (Different)

**File**: `/components/report-card/grade-history-table.tsx`

```tsx
// Uses slate-* instead of gray-*
className="text-slate-500 dark:text-slate-400"  // Header
className="border-b border-slate-200 dark:border-slate-700"  // Rows
className="hover:bg-slate-50 dark:hover:bg-slate-700/30"  // Hover (unique!)
className="bg-slate-50/50 dark:bg-slate-700/20"  // First row highlight
```

### Row Hover State Gap

| Table | Hover State |
|-------|-------------|
| `BaseDataTable` | None |
| `EditableDataTable` | None |
| `DataTableStandard` | None |
| `GradeHistoryTable` | `hover:bg-slate-50 dark:hover:bg-slate-700/30` |
| `AnalyticsTableChart` | None |

**Issue**: Only GradeHistoryTable has row hover - should be standardized

### AnalyticsTableChart Differences

**File**: `/components/charts/analytics-table-chart.tsx`

```tsx
// Different dark header background
className="bg-gray-50 dark:bg-gray-700/50"  // vs dark:bg-gray-900/20
```

### Recommended Solution (IMPLEMENTED ✅)

1. ~~Migrate `GradeHistoryTable` from `slate-*` to `gray-*`~~ ✅ Done
2. ~~Add optional row hover to `BaseDataTable`~~ ✅ Done
3. ~~Standardize header dark background to `dark:bg-gray-900/20`~~ ✅ Done

---

## 9. Avatars - COMPLETED ✅

**Severity: MEDIUM** | **Files Affected: 9** | **Effort: Low** | **Status: COMPLETE (December 2024)**

### Solution Implemented

A standardized Avatar system was created with utility functions and a reusable component.

#### Utility Functions Created

**File**: `/lib/utils/avatar.ts`

| Function | Description |
|----------|-------------|
| `getInitials(firstName, lastName)` | Generate initials from separate first/last name |
| `getInitials(fullName)` | Generate initials from a full name string |
| `getAvatarColor(userId)` | Generate consistent color from user ID (8-color palette) |
| `AVATAR_SIZES` | Size presets (xs, sm, md, lg, xl, 2xl) |

#### Component Created

**File**: `/components/ui/avatar.tsx`

```tsx
interface AvatarProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  src?: string | null;        // Image URL (optional)
  name?: string;              // Full name for initials
  firstName?: string;         // Alternative: first name
  lastName?: string;          // Alternative: last name
  userId?: string;            // For consistent color
  colorClass?: string;        // Override color
  className?: string;         // Additional classes
}
```

**Features**:
- Size presets matching existing patterns (xs=16px to 2xl=64px)
- Image support with Next.js `<Image />` component
- Initials fallback with dynamic color
- Icon fallback when no name provided
- Error handling for broken images

### Migration Status

**8 files migrated** to use the standardized Avatar component:

| File | Components Migrated |
|------|---------------------|
| `user-picker.tsx` | 2 avatar renders → Avatar component |
| `multi-user-picker.tsx` | 2 avatar renders → Avatar component |
| `recipients-modal.tsx` | 1 avatar render → Avatar component |
| `organization-users-modal.tsx` | 1 avatar render → Avatar component |
| `users-content.tsx` | 1 avatar render → Avatar component |
| `work-item-comments-section.tsx` | 2 avatar renders → Avatar component |
| `work-item-watchers-list.tsx` | 1 avatar render → Avatar component |
| `work-item-activity-section.tsx` | Removed unused `_getInitials` function |

### Benefits Achieved

| Metric | Before | After |
|--------|--------|-------|
| `getInitials` implementations | 4 (3 active + 1 unused) | 1 centralized |
| `getAvatarColor` implementations | 3 | 1 centralized |
| Components with hardcoded colors | 4 | 0 (all use dynamic colors) |
| Avatar utility files | 0 | 2 |
| Lines of duplicated code | ~100 | ~0 |

### Approved Exceptions

| File | Reason |
|------|--------|
| `work-item-activity-section.tsx` | Uses activity-type icons, not user avatars |
| `staff-member-card.tsx` | Photo-based with explicit photo_url |
| `channel-menu.tsx`, `dropdown-switch.tsx` | Use channel/organization images, not user avatars |

### Original Problem (Resolved)

Prior to standardization:
- 3 different initials algorithms
- 2 different color assignment patterns (dynamic vs hardcoded)
- 5 different size variations with no consistency
- No centralized utility or component

---

## 10. Tooltips/Popovers - COMPLETED (Partial)

**Severity: MEDIUM** | **Files Affected: 27+** | **Effort: Medium** | **Status: z-index & animation DONE (December 2024)**

### Solution Implemented

#### Phase 1: z-index Standardization - DONE

All floating UI elements now use `z-50` for consistent layering. Updated 13 files:

| File | Change |
|------|--------|
| `tooltip.tsx` | `z-10` -> `z-50` |
| `dropdown-profile.tsx` | `z-10` -> `z-50` |
| `dropdown-help.tsx` | `z-10` -> `z-50` |
| `dropdown-notifications.tsx` | `z-10` -> `z-50` |
| `dropdown-switch.tsx` | `z-10` -> `z-50` |
| `channel-menu.tsx` | `z-10` -> `z-50` |
| `edit-menu.tsx` | `z-10` -> `z-50` |
| `edit-menu-card.tsx` | `z-10` -> `z-50` |
| `dropdown-full.tsx` | `z-10` -> `z-50` |
| `date-select.tsx` | `z-10` -> `z-50` |
| `charts/data-source-selector.tsx` | `z-10` -> `z-50` |
| `role-selector.tsx` | `z-10` -> `z-50` |
| `charts/drill-down-chart-selector.tsx` | `z-10` -> `z-50` |

#### Phase 2: Animation Standardization - DONE

`data-table-dropdown.tsx` now uses Headless UI Transition (was the only dropdown without animation).

#### Phase 3: Animation Duration Standardization - DONE

All dropdown/tooltip components now use `duration-100` for snappy animations. Updated 11 files:

| File | Change |
|------|--------|
| `tooltip.tsx` | `duration-200` -> `duration-100` |
| `dropdown-profile.tsx` | `duration-200` -> `duration-100` |
| `dropdown-help.tsx` | `duration-200` -> `duration-100` |
| `dropdown-notifications.tsx` | `duration-200` -> `duration-100` |
| `dropdown-switch.tsx` | `duration-200` -> `duration-100` |
| `channel-menu.tsx` | `duration-200` -> `duration-100` |
| `edit-menu.tsx` | `duration-200` -> `duration-100` |
| `edit-menu-card.tsx` | `duration-200` -> `duration-100` |
| `dropdown-filter.tsx` | `duration-200` -> `duration-100` |
| `charts/dashboard-filter-dropdown.tsx` | `duration-200` -> `duration-100` |
| `data-table-dropdown.tsx` | `duration-200` -> `duration-100` |

**Note**: Modal components (`modal.tsx`, `crud-modal/index.tsx`) retain `duration-200` as longer animations are appropriate for modals.

### Standard Animation Pattern (Headless UI Transition)

All dropdown components now use:
```tsx
<Transition
  show={isOpen}
  as="div"
  className="z-50 ..."
  enter="transition ease-out duration-100 transform"
  enterFrom="opacity-0 -translate-y-2"
  enterTo="opacity-100 translate-y-0"
  leave="transition ease-out duration-100"
  leaveFrom="opacity-100"
  leaveTo="opacity-0"
>
```

### Approved Exceptions (Not Migrated)

| Component | Reason |
|-----------|--------|
| `score-help-tooltip.tsx` | Full modal with backdrop - not a dropdown |
| `hierarchy-select.tsx` | Mobile bottom sheet with swipe gestures |
| `popover.tsx` + `datepicker.tsx` | Radix Calendar integration - specialized UX |

### Original Problem (Resolved)

Three animation systems caused inconsistency:
1. **Headless UI Transition** - 10+ files (now standard)
2. **Radix UI data attributes** - 1 file (exception: calendar picker)
3. **Framer Motion** - 2 files (exceptions: modal tooltip, mobile sheet)

z-index mix of `z-10` and `z-50` could cause dropdowns to appear behind other UI elements. Now standardized to `z-50`.

### Width/Size Variations (Not Changed)

Width tokens remain as-is (7 variations). Future work could consolidate to 4 standard sizes:
- `sm`: `min-w-[9rem]` (144px) - Compact menus
- `md`: `min-w-[14rem]` (224px) - Standard dropdowns
- `lg`: `min-w-[20rem]` (320px) - Rich content
- `auto`: No min-width - Content-sized

### Files with Tooltip/Popover Patterns

**Using Standard Pattern (z-50 + Headless UI Transition)**:
- `/components/tooltip.tsx`
- `/components/dropdown-full.tsx`
- `/components/dropdown-filter.tsx`
- `/components/dropdown-help.tsx`
- `/components/dropdown-profile.tsx`
- `/components/dropdown-switch.tsx`
- `/components/dropdown-notifications.tsx`
- `/components/data-table-dropdown.tsx`
- `/components/channel-menu.tsx`
- `/components/edit-menu.tsx`
- `/components/edit-menu-card.tsx`
- `/components/date-select.tsx`
- `/components/charts/data-source-selector.tsx`

**Exceptions (Different Animation System)**:
- `/components/ui/popover.tsx` - Radix UI (calendar integration)
- `/components/report-card/score-help-tooltip.tsx` - Framer Motion (modal)
- `/components/hierarchy-select.tsx` - Framer Motion (mobile sheet)

---

## 11. Navigation/Tabs - COMPLETED ✅

**Severity: MEDIUM** | **Files Affected: 20+** | **Effort: Low** | **Status: COMPLETE (December 2024)**

### Solution Implemented

A standardized `Tabs` component was created at `/components/ui/tabs.tsx` with the following features:

#### Variants
| Variant | Use Case |
|---------|----------|
| `underline` | Standard tabs with bottom border (default) |
| `pill` | Pill-style tabs with background highlight |

#### Features
- Standardized violet active state (`border-violet-500 text-violet-600`)
- Icon support via `icon` prop on tabs
- ARIA accessibility attributes (`role="tablist"`, `role="tab"`, `aria-selected`)
- Dark mode support

### Migration Status

**3 files migrated** to use the standardized Tabs component:

| File | Previous Color | Status |
|------|----------------|--------|
| `work-item-detail-content.tsx` | Gray | ✅ Migrated to violet |
| `redis-admin-tabs.tsx` | Violet (inline) | ✅ Migrated to component |
| `edit-transition-config-modal.tsx` | Blue | ✅ Migrated to violet |

### Approved Exceptions

| File | Reason |
|------|--------|
| `user-announcement-modal.tsx` | Complex tab content with dynamic badge counter; already uses violet |

### Path Bug Fixes

**Files fixed** (6 total occurrences of `/default/work` → `/work`):
- `work-item-hierarchy-breadcrumbs.tsx` - 2 occurrences
- `editable-work-items-table.tsx` - 1 occurrence
- `work-item-expanded-row.tsx` - 3 occurrences

### Active Detection Patterns (Documented)

| Pattern | Use Case | Example |
|---------|----------|---------|
| Exact match (`===`) | Leaf-level navigation items | `/settings/account` |
| Segment check (`segments.includes()`) | Section dropdowns that expand on child routes | Dashboard, Configure |
| Path prefix (`pathname.includes()`) | Items with nested child pages | Work Items (`/work`, `/work/123`) |

### Usage Example

```tsx
import { Tabs } from '@/components/ui/tabs';

<Tabs
  tabs={[
    { id: 'details', label: 'Details' },
    { id: 'comments', label: 'Comments' },
  ]}
  activeTab={activeTab}
  onChange={setActiveTab}
  ariaLabel="Work item sections"
/>
```

### Original Problem (Resolved)

Prior to standardization:
- 4 tab implementations with 3 different active colors (gray, violet, blue)
- No reusable Tabs component (all inline ~25 lines each)
- Path bug (`/default/work` instead of `/work`) in 3 files (6 occurrences)

**Implementation Plan**: See [navigation-tabs-standardization-plan.md](plans/navigation-tabs-standardization-plan.md) for full details.

---

## 12. Icons - DEFERRED ⏸️

**Severity: MEDIUM** | **Files Affected: 195+** | **Effort: Low** | **Status: DEFERRED (December 2024)**

### Decision

After analysis, this item was **deferred** as low-value:

1. **Tailwind classes ARE constants** - `w-4 h-4` is already standardized
2. **Zero functional bugs** - icons render correctly everywhere
3. **Class order doesn't matter** - `h-4 w-4` vs `w-4 h-4` is functionally identical
4. **No dark mode gaps** - colors already have dark variants where needed

Unlike Button/Modal/FormField standardization which eliminated **behavioral inconsistencies**, icon "standardization" would only add an abstraction layer over already-working Tailwind classes.

**Analysis document**: See [icon-system-standardization-plan.md](plans/icon-system-standardization-plan.md) for full findings.

### Original Problem Statement

Icons (primarily Lucide React) lack standardized size and color constants.

### Icon Library

**Primary**: Lucide React (`lucide-react` v0.561.0)
- 29+ files with Lucide imports
- 146 components using icons

### Size Variations

| Size | Tailwind Class | Usage |
|------|---------------|-------|
| 12px | `w-3 h-3` | Dropdown indicators |
| 16px | `w-4 h-4` | Standard button icons (44 occurrences) |
| 20px | `w-5 h-5` | MFA dialogs, list items (15+ occurrences) |
| 24px | `w-6 h-6` | Header buttons, nav items (12+ occurrences) |
| 32px | `w-8 h-8` | Default content loading |
| 48px | `w-12 h-12` | Error display icons (5+ occurrences) |

### Class Order Inconsistency

```tsx
// Pattern A (more common)
className="w-4 h-4"

// Pattern B (also used)
className="h-4 w-4"
```

### Color Patterns

```tsx
// Neutral (60+ instances)
text-gray-400  // Most common (41)
text-gray-500  // Secondary (19)

// Brand (24+ instances)
text-violet-600  // Primary brand (16)
text-violet-500  // Active states

// Semantic (41+ instances)
text-red-600    // Errors (22)
text-green-600  // Success (11)
text-amber-600  // Warnings (10)
```

### Spinner Size Presets (Only Standardized Icons)

**File**: `/components/ui/spinner.tsx`
```tsx
export const SPINNER_SIZES = {
  sm: { sizeClass: 'w-4 h-4', borderClass: 'border-2' },
  md: { sizeClass: 'w-8 h-8', borderClass: 'border-3' },
  lg: { sizeClass: 'w-12 h-12', borderClass: 'border-4' },
  xl: { sizeClass: 'w-16 h-16', borderClass: 'border-4' },
};
```

**Issue**: Other icons don't use this pattern

### Alert Icons (Shared)

**File**: `/components/ui/alert-shared.tsx`
- Custom SVG paths for warning, error, success, info
- Fixed 16x16 size
- Dynamic color based on variant

### Recommended Solution

Create `/lib/constants/icon-system.ts`:
```tsx
export const ICON_SIZES = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  xl: 'w-8 h-8',
  '2xl': 'w-12 h-12',
};

export const ICON_COLORS = {
  primary: 'text-violet-600 dark:text-violet-400',
  secondary: 'text-gray-400 dark:text-gray-500',
  success: 'text-green-600 dark:text-green-400',
  warning: 'text-amber-600 dark:text-amber-400',
  error: 'text-red-600 dark:text-red-400',
};
```

---

## 13. Alerts/Toasts - Legacy Hook Conflict

**Severity: LOW** | **Files Affected: 10+** | **Effort: Low**

### Problem Statement

A legacy `use-toast.ts` hook conflicts with the new `useToast()` from toast.tsx.

### Current Toast System

**File**: `/components/toast.tsx`

**Features**:
- Dual modes: Controlled (`<Toast open={} setOpen={}>`) and Context (`useToast()`)
- Variants: `solid`, `light`, `outlined`
- Types: `warning`, `error`, `success`, `info`
- Auto-dismiss with `duration` prop
- Stacking at bottom-right

### Legacy Hook (Conflicting)

**File**: `/lib/hooks/use-toast.ts`

```tsx
// Different API
const { toast, showToast, hideToast, setToastOpen } = useToast();
showToast('error', 'Something went wrong');
```

**Issue**: Different function signature from new `useToast()` in toast.tsx

### Alert Shared System (Good)

**File**: `/components/ui/alert-shared.tsx`

Provides:
- `AlertType`: warning, error, success, info
- `AlertVariant`: solid, light, outlined
- `ALERT_VARIANT_STYLES`: Complete color mapping
- `AlertIcon`, `CloseIcon`: Reusable components

### Inline Alert Boxes (202 instances)

Many components implement inline alerts manually:
```tsx
<div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
  <div className="flex items-start gap-3">
    <svg className="w-4 h-4 fill-current text-red-400" />
    <div>
      <h3 className="text-red-800">Error Title</h3>
      <p className="text-red-600">Error message</p>
    </div>
  </div>
</div>
```

**Found in**: 70+ configuration pages, dashboards, charts, announcements

### Recommended Solution

1. Delete `/lib/hooks/use-toast.ts` (appears unused)
2. Create `<InlineAlert type="" variant="">` component for the 202 inline instances

---

## 14. Typography - COMPLETED ✅

**Severity: LOW** | **Files Affected: 40** | **Effort: Low** | **Status: COMPLETE (December 2024)**

### Solution Implemented

All H3 headings have been migrated from `font-medium` (500) to `font-semibold` (600) for proper heading weight hierarchy.

### Migration Summary

**Total instances migrated: 40 across 37 files**

| Category | Files | Instances |
|----------|-------|-----------|
| Confirmation/Delete Modals | 10 | 10 |
| Chart Builder Components | 10 | 12 |
| Dashboard Components | 4 | 4 |
| Data Explorer Pages | 3 | 3 |
| Report Card Views | 2 | 4 |
| Configure Pages | 3 | 3 |
| UI Components | 2 | 2 |
| Other Components | 3 | 2 |

### Standard Heading Pattern

```tsx
// H3 - Widget/Section Titles (STANDARDIZED)
className="text-lg font-semibold text-gray-900 dark:text-gray-100"

// For Report Card (slate palette)
className="text-lg font-semibold text-slate-800 dark:text-slate-200"
```

### Heading Weight Hierarchy (Now Correct)

| Level | Weight | Value | Status |
|-------|--------|-------|--------|
| H1 | `font-bold` | 700 | ✅ Correct |
| H2 | `font-semibold` | 600 | ✅ Correct |
| H3 | `font-semibold` | 600 | ✅ Fixed |

### Files Migrated

**Modals:**
- `delete-work-item-modal.tsx`, `delete-confirmation-modal.tsx`, `feedback-modal.tsx`
- `reset-mfa-confirmation-modal.tsx`, `manage-relationships-modal.tsx`, `manage-work-item-fields-modal.tsx`
- `data-source-connection-test-modal.tsx`

**Chart Components:**
- `chart-builder-save.tsx`, `chart-builder-advanced.tsx`, `chart-builder-core.tsx`
- `chart-builder-drill-down.tsx`, `chart-builder-preview.tsx`, `date-range-presets.tsx`
- `advanced-filter-builder.tsx`, `historical-comparison-widget.tsx`, `dashboard-preview.tsx`
- `dashboard-states.tsx`, `dashboard-row-builder.tsx`

**Pages:**
- `data/explorer/suggestions/page.tsx`, `data/explorer/feedback/page.tsx`, `data/explorer/test-cases/page.tsx`
- `dashboard/report-card/report-card-view.tsx`, `dashboard/report-card/annual-review/annual-review-view.tsx`
- `configure/practices/practices-content.tsx`, `configure/practices/[id]/sections/branding-section.tsx`
- `configure/dashboards/[dashboardId]/edit/page.tsx`, `configure/charts/[chartId]/edit/page.tsx`
- `admin/report-card/report-card-admin.tsx`

**Components:**
- `gallery-manager.tsx`, `staff-list-embedded.tsx`, `staff-member-card.tsx`
- `services-editor.tsx`, `conditions-editor.tsx`, `error-display.tsx`
- `color-palette-selector.tsx`, `ui/empty-state.tsx`, `dashboards/row-builder/components/row-controls.tsx`

### Caption Text

Caption text is already standardized via the `FormHelp` component (`text-xs text-gray-500 dark:text-gray-400`).

### Text Truncation

The `line-clamp-*` utility is available via Tailwind and already used in 2 locations. No further changes needed.

**Implementation Plan**: See [typography-standardization-plan.md](plans/typography-standardization-plan.md) for full details.

---

## 15. Pagination - COMPLETED ✅

**Severity: LOW** | **Files Affected: 5+** | **Effort: Minimal** | **Status: COMPLETE (December 2024)**

### Solution Implemented

The unused `pagination-numeric.tsx` was deleted in commit `19f71c6e`. The pagination system is now clean and consistent.

### Current Pagination System

**Active Components**:
- `/lib/hooks/use-pagination.ts` - Client-side pagination logic hook
- `/components/pagination-classic.tsx` - Previous/Next UI component
- `/components/data-table/data-table-pagination.tsx` - DataTable wrapper

### Usage Pattern

17 files correctly use the standard pattern via `DataTableStandard` or `EditableDataTable`:

```tsx
<DataTableStandard
  data={items}
  columns={columns}
  pagination={{ itemsPerPage: 10 }}
/>
```

### Approved Exceptions

| File | Reason |
|------|--------|
| `at-risk-users-panel.tsx` | Admin component with custom filtering/sorting |
| `redis-key-browser.tsx` | Server-side pagination (page sent to API) |

### Original Problem (Resolved)

`pagination-numeric.tsx` was a hardcoded placeholder with pages 1,2,3...9 that was not connected to the `usePagination` hook. File was deleted as dead code.

---

## 16. List Items - DEFERRED ⏸️

**Severity: LOW** | **Files Affected: 15+** | **Effort: Medium** | **Status: DEFERRED (December 2024)**

### Decision

After comprehensive analysis (286 `space-y-*` occurrences across 159 files), this item was **deferred** as low-value:

1. **Variations are intentional** - Different list types legitimately need different spacing
2. **Consistent within categories** - Comments, attachments, timelines each follow their own consistent pattern
3. **Zero functional bugs** - All lists render correctly
4. **Low ROI** - A ListItem component would add abstraction overhead without meaningful benefit

Unlike Button/Modal/FormField standardization which eliminated **behavioral inconsistencies**, list spacing variations are appropriate contextual design choices.

**Analysis document**: See [list-items-standardization-plan.md](plans/list-items-standardization-plan.md) for full findings.

### Spacing Hierarchy (Validated as Correct)

```
space-y-8  → Page/Modal sections
space-y-6  → Form sections, major blocks
space-y-4  → Cards, comments (visually distinct items)
space-y-3  → Standard list items (watchers, events)
space-y-2  → Compact lists (attachments, nested items)
space-y-1  → Metadata, tight sub-items
```

### Pattern Summary

| Component Type | Container | Item Gap | Item Padding | Border Style |
|---------------|-----------|----------|--------------|--------------|
| **Timeline** | `-mb-8` | `pb-8` | N/A | Connector line |
| **Comments** | `space-y-4` | `gap-3` | `p-3` | Background card |
| **Attachments** | `space-y-2` | `gap-4` | `p-4` | Border card |
| **Recipients** | `divide-y` | N/A | `py-3 px-5` | Divider line |
| **Watchers** | `space-y-3` | `gap-3` | `p-3` | Border card |

### If Revisited Later

If this becomes a priority, document spacing tokens (not components):

```tsx
// lib/constants/spacing.ts
export const LIST_SPACING = {
  tight: 'space-y-2',    // Compact items (attachments)
  normal: 'space-y-3',   // Standard lists (watchers, events)
  relaxed: 'space-y-4',  // Card-style lists (comments)
} as const;
```

---

## 17. Dead Code Removed ✅

> **Status**: COMPLETED (December 2024)

The following dead code files have been removed from the codebase:

### ConfigureMenuSection (Duplicate) - DELETED

**File**: `/components/ui/sidebar/configure-menu-section.tsx`

**Issue**: Nearly identical to `AdminMenuSection` (177 lines vs 261 lines). AdminMenuSection is used; ConfigureMenuSection was not imported anywhere.

### pagination-numeric.tsx (Unused) - DELETED

**File**: `/components/pagination-numeric.tsx`

**Issue**: Hardcoded placeholder with pages 1,2,3...9. Not connected to usePagination hook.

### use-toast.ts (Legacy Hook) - DELETED

**File**: `/lib/hooks/use-toast.ts`

**Issue**: Different API from current `useToast()` in toast.tsx.

**Migration**: `/components/charts/chart-builder.tsx` was migrated to use `useToast()` from `@/components/toast` with the new object-based API: `showToast({ type: 'error', message: '...' })`

---

## 18. Recommended Standardization Priority

### Phase 1: Highest Impact (Critical)

| Task | Files Affected | Effort | Status |
|------|----------------|--------|--------|
| ~~Create Button component~~ | ~~197+~~ | ~~High~~ | ✅ Done |
| ~~Create Modal component~~ | ~~21+ (from scratch)~~ | ~~High~~ | ✅ Done |
| Create Badge component | 50+ (438 inline) | Medium | Pending |
| ~~Standardize loading animations~~ | ~~70+~~ | ~~Medium~~ | ✅ Done |

### Phase 2: Medium Impact

| Task | Files Affected | Effort | Status |
|------|----------------|--------|--------|
| ~~Create FormField wrapper~~ | ~~20+~~ | ~~Medium~~ | ✅ Done |
| ~~Create Card component system~~ | ~~50+~~ | ~~Medium~~ | ✅ Done |
| ~~Create Avatar component + utils~~ | ~~9~~ | ~~Low~~ | ✅ Done |
| ~~Standardize icon sizing~~ | ~~146+~~ | ~~Low~~ | ⏸️ Deferred |

### Phase 3: Polish

| Task | Files Affected | Effort | Status |
|------|----------------|--------|--------|
| Unify tooltip/popover animations | 27+ | Medium | Pending |
| ~~Standardize tab active states~~ | ~~20+~~ | ~~Low~~ | ✅ Done |
| Create InlineAlert component | 70+ | Low | Pending |
| ~~Fix typography hierarchy~~ | ~~40~~ | ~~Low~~ | ✅ Done |
| ~~Remove dead code~~ | ~~3 files~~ | ~~Minimal~~ | ✅ Done |
| ~~Standardize list item spacing~~ | ~~15+~~ | ~~Medium~~ | ⏸️ Deferred (intentional variation) |

---

## Appendix: File Counts by Category

| Category | Component Files | Inline Instances | Status |
|----------|-----------------|------------------|--------|
| Buttons | 1 standard (`/components/ui/button.tsx`) | 60+ migrated | ✅ Done |
| Modals | 1 standard (`/components/ui/modal.tsx`) + 3 deprecated wrappers | 18/21 migrated (3 valid exceptions) | ✅ Done |
| Badges | 3 | 438+ inline | Pending |
| Loading | 8 | 2 animate-pulse (intentional) | ✅ Done |
| Form Fields | 4 standard (`/components/ui/form-*.tsx`) | 27 files migrated | ✅ Done |
| Cards | 1 standard (`/components/ui/card.tsx`) + 1 special (GlassCard) | 19 admin migrated, 10 report kept (motion.div) | ✅ Done |
| Error/Empty | 5 | 30+ inline | Pending |
| Tables | 17 | - | Pending |
| Avatars | 2 (`/lib/utils/avatar.ts`, `/components/ui/avatar.tsx`) | 8 files migrated | ✅ Done |
| Tooltips | 12 | - | Pending |
| Navigation | 1 standard (`/components/ui/tabs.tsx`) | 3 files migrated, 6 path bugs fixed | ✅ Done |
| Icons | 0 constants | 195+ usages | ⏸️ Deferred |
| Alerts | 4 | 202 inline | Pending |
| Typography | N/A (40 H3 instances migrated) | - | ✅ Done |
| Pagination | 3 (`usePagination`, `PaginationClassic`, `DataTablePagination`) | 17 files using standard pattern | ✅ Done |
| List Items | N/A (intentional variation) | 286 space-y-* occurrences | ⏸️ Deferred |
