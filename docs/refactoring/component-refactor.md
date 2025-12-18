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
8. [Tables](#8-tables---color-palette-inconsistency)
9. [Avatars](#9-avatars---3-different-initials-algorithms)
10. [Tooltips/Popovers](#10-tooltipspopovers---3-animation-systems)
11. [Navigation/Tabs](#11-navigationtabs---inconsistent-active-states)
12. [Icons](#12-icons---no-global-sizecolor-system)
13. [Alerts/Toasts](#13-alertstoasts---legacy-hook-conflict)
14. [Typography](#14-typography---heading-weight-hierarchy)
15. [Pagination](#15-pagination---unused-component)
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

## 8. Tables - Color Palette Inconsistency

**Severity: MEDIUM** | **Files Affected: 17+** | **Effort: Low**

### Problem Statement

The main DataTable system is consistent, but `GradeHistoryTable` uses a different color palette.

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

### Recommended Solution

1. Migrate `GradeHistoryTable` from `slate-*` to `gray-*`
2. Add optional row hover to `BaseDataTable`
3. Standardize header dark background to `dark:bg-gray-900/20`

---

## 9. Avatars - 3 Different Initials Algorithms

**Severity: MEDIUM** | **Files Affected: 15+** | **Effort: Low**

### Problem Statement

No shared avatar utility exists. Initials generation and color assignment are implemented differently across components.

### Initials Generation Patterns

#### Pattern A: First/Last Name (Most Common)
```tsx
// /components/user-picker.tsx, /components/announcements/multi-user-picker.tsx
const getInitials = (user: User): string => {
  return `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase();
};
```

#### Pattern B: String Splitting
```tsx
// /components/work-items/work-item-activity-section.tsx
// /components/work-items/work-item-comments-section.tsx
const getInitials = (name: string) => {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};
```

#### Pattern C: Safety Check
```tsx
// /components/announcements/recipients-modal.tsx
const getInitials = (name: string): string => {
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return `${parts[0]?.charAt(0) ?? ''}${parts[1]?.charAt(0) ?? ''}`.toUpperCase();
  }
  return name.charAt(0).toUpperCase();
};
```

### Color Assignment Patterns

#### Pattern A: Dynamic 8-Color Palette
```tsx
// /components/user-picker.tsx, /components/announcements/multi-user-picker.tsx
const colors = [
  'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-red-500',
  'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500',
];
const index = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
return colors[index];
```

#### Pattern B: Hardcoded Single Color
```tsx
// /components/organization-users-modal.tsx
className="w-8 h-8 rounded-full bg-violet-500"  // All users same color

// /components/work-item-comments-section.tsx
className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600"  // All gray
```

### Size Variations

| Size | Files Using |
|------|-------------|
| `w-4 h-4` | multi-user-picker (tags) |
| `w-6 h-6` | user-picker (dropdown) |
| `w-8 h-8` | organization-users-modal, recipients-modal, comments, activity |
| `w-12 h-12` | delete-confirmation modals |
| `w-16 h-16` | staff-member-card |

### Text Size in Avatars

| Size | Files |
|------|-------|
| `text-[10px]` | multi-user-picker (tags) |
| `text-xs` | user-picker, organization-users-modal |
| `text-sm` | recipients-modal, comments |

### Files with Avatar Implementations

- `/components/user-picker.tsx`
- `/components/announcements/multi-user-picker.tsx`
- `/components/announcements/recipients-modal.tsx`
- `/components/organization-users-modal.tsx`
- `/components/work-items/work-item-comments-section.tsx`
- `/components/work-items/work-item-activity-section.tsx`
- `/components/work-item-watchers-list.tsx`
- `/components/staff-member-card.tsx`
- `/components/channel-menu.tsx`
- `/components/dropdown-switch.tsx`

### Recommended Solution

Create `/lib/utils/avatar-utils.ts`:
```tsx
export function getInitials(firstName: string, lastName?: string): string
export function getInitials(fullName: string): string
export function getAvatarColor(userId: string): string
```

Create `/components/ui/avatar.tsx`:
```tsx
interface AvatarProps {
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  src?: string;
  name: string;
  userId?: string;  // For consistent color
}
```

---

## 10. Tooltips/Popovers - 3 Animation Systems

**Severity: MEDIUM** | **Files Affected: 27+** | **Effort: Medium**

### Problem Statement

Three different animation systems are used for tooltips and popovers, with inconsistent z-index values.

### Animation Systems

#### System 1: Headless UI Transition (Most Common)
```tsx
// Used by most dropdowns
<Transition
  enter="transition ease-out duration-200 transform"
  enterFrom="opacity-0 -translate-y-2"
  enterTo="opacity-100 translate-y-0"
  leave="transition ease-out duration-200"
  leaveFrom="opacity-100"
  leaveTo="opacity-0"
/>
```
**Files**: All dropdown-*.tsx files, tooltip.tsx

#### System 2: Radix UI Data Attributes
```tsx
// /components/ui/popover.tsx
className="data-[state=open]:animate-in data-[state=closed]:animate-out
           data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
           data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95
           data-[side=bottom]:slide-in-from-top-2"
```

#### System 3: Framer Motion
```tsx
// /components/report-card/score-help-tooltip.tsx
<motion.div
  initial={{ opacity: 0, scale: 0.95, y: 20 }}
  animate={{ opacity: 1, scale: 1, y: 0 }}
  exit={{ opacity: 0, scale: 0.95, y: 20 }}
  transition={{ duration: 0.2 }}
/>
```

### z-index Inconsistency

| Component | z-index |
|-----------|---------|
| Tooltip | `z-10` |
| Dropdown menus | `z-10` |
| Radix Popover | `z-50` |
| DataTableDropdown | `z-50` |
| Modals | `z-50` |

**Issue**: Mix of `z-10` and `z-50` can cause layering problems

### Width/Size Variations

| Component | Width |
|-----------|-------|
| Tooltip (sm) | `min-w-[11rem]` |
| Tooltip (md) | `min-w-[14rem]` |
| Tooltip (lg) | `min-w-[18rem]` |
| Dropdown menus | `min-w-[11rem]` to `min-w-[20rem]` |
| Radix Popover | `w-72` (fixed 288px) |

### Trigger Mechanism Variations

| Component | Trigger | Open | Close |
|-----------|---------|------|-------|
| Custom Tooltip | Click | Click button | Click/blur |
| Dropdown menus | Click | Click MenuButton | Click item/blur |
| Radix Popover | Click | Click trigger | Click outside/ESC |
| Chart tooltips | Hover | Auto | Auto |
| Title attribute | Hover | Native | Auto delay |

### Files with Tooltip/Popover Patterns

**Core Components**:
- `/components/tooltip.tsx`
- `/components/ui/popover.tsx`
- `/components/dropdown-full.tsx`
- `/components/dropdown-filter.tsx`
- `/components/dropdown-help.tsx`
- `/components/dropdown-profile.tsx`
- `/components/dropdown-switch.tsx`
- `/components/dropdown-notifications.tsx`
- `/components/data-table-dropdown.tsx`
- `/components/datepicker.tsx`

**Specialized**:
- `/components/report-card/score-help-tooltip.tsx` (Modal-based)
- `/components/charts/chartjs-config.tsx` (Chart.js tooltips)

### Recommended Solution

1. Choose single animation system (recommend Headless UI Transition)
2. Standardize z-index to `z-50` for all floating elements
3. Create unified `<Tooltip>` component with hover trigger option

---

## 11. Navigation/Tabs - Inconsistent Active States

**Severity: MEDIUM** | **Files Affected: 20+** | **Effort: Low**

### Problem Statement

Tab active states use different colors, and active detection methods vary.

### Tab Active State Colors

#### Work Item Detail Tabs
```tsx
// /app/(default)/work/[id]/work-item-detail-content.tsx
activeTab === tab
  ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100'  // Gray!
  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700'
```

#### Redis Admin Tabs
```tsx
// /app/(default)/admin/command-center/components/redis-admin-tabs.tsx
activeTab === tab
  ? 'border-violet-500 text-violet-600 dark:text-violet-400 font-medium'  // Violet
  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900'
```

**Issue**: Work item tabs use gray, Redis tabs use violet

### Sidebar Active States (Consistent)

```tsx
// /components/ui/sidebar-link.tsx
pathname === href
  ? 'group-[.is-link-group]:text-violet-500'
  : 'hover:text-gray-900 dark:hover:text-white'

// /components/ui/sidebar-link-group.tsx
// Gradient background when open
className={`${open && 'from-violet-500/[0.12] dark:from-violet-500/[0.24] to-violet-500/[0.04]'}`}
```

### Active Detection Methods

| Component | Method |
|-----------|--------|
| SidebarLink | `pathname === href` |
| DashboardMenuSection | `segments.includes('dashboard')` |
| WorkMenuSection | `pathname.includes('work')` |
| AdminMenuSection | `segments.includes('configure')` or `segments.includes('admin')` |
| DataExplorerMenuSection | `pathname.includes('data/explorer')` |

**Issue**: Mix of exact match, includes, and segment checking

### Breadcrumb Implementations

#### Work Item Breadcrumbs
**File**: `/components/work-items/work-item-breadcrumbs.tsx`
```tsx
// Clickable ancestors
className="text-gray-600 dark:text-gray-400 hover:text-gray-900"

// Current item (last)
className="font-medium truncate max-w-[200px]"  // Not clickable
```

#### Work Item Hierarchy Breadcrumbs
**File**: `/components/work-items/work-item-hierarchy-breadcrumbs.tsx`
```tsx
// Uses Link components
className="hover:text-gray-900 dark:hover:text-gray-200 transition-colors"

// Current item as span
```

### Recommended Solution

1. Standardize tab active color to `border-violet-500` (brand color)
2. Create `<Tabs>` component with consistent styling
3. Document active detection pattern preference

---

## 12. Icons - No Global Size/Color System

**Severity: MEDIUM** | **Files Affected: 146+** | **Effort: Low**

### Problem Statement

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

## 14. Typography - Heading Weight Hierarchy

**Severity: LOW** | **Files Affected: 15+** | **Effort: Low**

### Problem Statement

H3 headings use `font-medium` (500) which is lighter than expected in the hierarchy.

### Current Heading Weights

| Level | Weight | Value | Correct? |
|-------|--------|-------|----------|
| H1 | `font-bold` | 700 | Yes |
| H2 | `font-semibold` | 600 | Yes |
| H3 | `font-medium` | 500 | No (should be 600) |

### Heading Patterns

#### H1 (Page Titles)
```tsx
className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold"
```
**Used in**: Configuration pages, work items

#### H2 (Section Titles)
```tsx
className="text-xl font-semibold text-gray-900 dark:text-gray-100"
```
**Used in**: Modals, panels

#### H3 (Widget Titles)
```tsx
className="text-lg font-medium text-gray-900 dark:text-gray-100"
```
**Used in**: Chart headers, cards

### Text Truncation

Only `truncate` (single-line) is used. No `line-clamp-*` utilities found.

**Files using truncate**:
- `/components/dropdown-switch.tsx`
- `/components/channel-menu.tsx`
- `/components/charts/ChartLegend.tsx`
- `/components/user-picker.tsx`

**Issue**: Multi-line truncation not available

### Caption Text Inconsistency

| Pattern | Size | Files |
|---------|------|-------|
| Pattern A | `text-xs` | CRUD fields, table headers |
| Pattern B | `text-sm` with gray-500 | Help text, descriptions |

### Recommended Solution

1. Upgrade H3 to `font-semibold`
2. Add `line-clamp-2`, `line-clamp-3` utilities where needed
3. Document typography hierarchy

---

## 15. Pagination - Unused Component

**Severity: LOW** | **Files Affected: 5+** | **Effort: Minimal**

### Problem Statement

`pagination-numeric.tsx` exists but is a hardcoded placeholder, not used in the application.

### Current Pagination System

**Working Components**:
- `/lib/hooks/use-pagination.ts` - Pagination logic
- `/components/pagination-classic.tsx` - Active UI (Previous/Next)
- `/components/data-table/data-table-pagination.tsx` - Wrapper

**Unused**:
- `/components/pagination-numeric.tsx` - Hardcoded pages 1,2,3...9 (not connected to hook)

### Recommended Solution

Delete `/components/pagination-numeric.tsx` or implement properly

---

## 16. List Items - Spacing Inconsistency

**Severity: LOW** | **Files Affected: 15+** | **Effort: Low**

### Problem Statement

List spacing and padding vary across components.

### Spacing Variations

| Pattern | Files |
|---------|-------|
| `space-y-2` | Various |
| `space-y-3` | Various |
| `space-y-4` | Various |
| `gap-2`, `gap-3`, `gap-4` | Flex layouts |

### Padding Variations

| Pattern | Files |
|---------|-------|
| `p-3` | Comments, smaller items |
| `p-4` | Attachments, relationships |
| `px-5 py-3` | Recipients (divided list) |
| `pb-8` | Activity timeline |

### Border/Divider Patterns

| Pattern | Files |
|---------|-------|
| `divide-y divide-gray-200` | Recipients modal |
| `border border-gray-200 rounded-lg` | Attachments, relationships |
| `bg-gray-50 rounded-lg` | Comments (card style) |
| Connector line | Activity timeline |

### Recommended Solution

Standardize list spacing tokens in design system

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
| Create Avatar component + utils | 15+ | Low | Pending |
| Standardize icon sizing | 146+ | Low | Pending |

### Phase 3: Polish

| Task | Files Affected | Effort | Status |
|------|----------------|--------|--------|
| Unify tooltip/popover animations | 27+ | Medium | Pending |
| Standardize tab active states | 20+ | Low | Pending |
| Create InlineAlert component | 70+ | Low | Pending |
| Fix typography hierarchy | 15+ | Low | Pending |
| ~~Remove dead code~~ | ~~3 files~~ | ~~Minimal~~ | ✅ Done |

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
| Avatars | 0 | 15+ inline | Pending |
| Tooltips | 12 | - | Pending |
| Navigation | 20+ | - | Pending |
| Icons | 0 constants | 146+ usages | Pending |
| Alerts | 4 | 202 inline | Pending |
| Typography | 0 | - | Pending |
| Pagination | 2 | - | Pending |
