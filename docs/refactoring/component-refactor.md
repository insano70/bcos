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
2. [Modals/Dialogs](#2-modalsdialogs---3-overlapping-base-components)
3. [Badges/Status Indicators](#3-badgesstatus-indicators---438-inline-implementations)
4. [Loading/Skeleton States](#4-loadingskeleton-states---animation-mismatch)
5. [Form Fields](#5-form-fields---3-different-required-indicator-patterns)
6. [Cards/Panels](#6-cardspanels---no-unified-card-component)
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

## 2. Modals/Dialogs - 3 Overlapping Base Components

**Severity: CRITICAL** | **Files Affected: 57+** | **Effort: High**

### Problem Statement

Three similar but different base modal components exist, plus specialized modals that deviate from all patterns.

### Current Base Components

| Component | File | Header | Close Button | Use Case |
|-----------|------|--------|--------------|----------|
| `ModalBasic` | `/components/modal-basic.tsx` | Yes (with border) | Top-right in header | Titled modals |
| `ModalBlank` | `/components/modal-blank.tsx` | No | None | Custom layouts |
| `ModalAction` | `/components/modal-action.tsx` | No | Top-right (relative) | Action-focused |

### Shared Infrastructure (All Three)

```tsx
// Backdrop
className="fixed inset-0 bg-gray-900/30 z-50 transition-opacity"

// Animation
enter="transition ease-in-out duration-200"
enterFrom="opacity-0 translate-y-4"
enterTo="opacity-100 translate-y-0"
leave="transition ease-in-out duration-200"
leaveFrom="opacity-100 translate-y-0"
leaveTo="opacity-0 translate-y-4"

// Panel
className="max-w-lg w-full max-h-full"
```

### Header Styling Variations

#### Standard ModalBasic Header
```tsx
<div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700/60">
  <Dialog.Title className="font-semibold text-gray-800 dark:text-gray-100">
```

#### Schema Instructions Modal (Different)
```tsx
<div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
  <Dialog.Title className="text-lg font-semibold">
  <p className="mt-1 text-sm text-gray-500"> {/* Subtitle */}
```

#### Recipients Modal (Different)
```tsx
<div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700/60">
  <Dialog.Title className="font-semibold text-gray-800 dark:text-gray-100">
  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">
```

**Inconsistencies**:
- Padding: `px-5 py-3` vs `px-4 sm:px-6 py-4` vs `px-6 py-4`
- Title size: `font-semibold` vs `text-lg font-semibold`
- Border color: `gray-700/60` vs `gray-700`

### Close Button Variations

#### Pattern 1: Custom SVG (fill-based)
```tsx
<svg className="fill-current" width="16" height="16" viewBox="0 0 16 16">
  <path d="M7.95 6.536l4.242-4.243..." />
</svg>
```
**Used in**: `ModalBasic`, `AddPracticeModal`, `EditWorkItemModal`, `RecipientsModal`

#### Pattern 2: X SVG (stroke-based)
```tsx
<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
</svg>
```
**Used in**: `ChartFullscreenModal`, `SchemaInstructionsModal`, `FullscreenLoadingModal`

#### Pattern 3: No Icon (sr-only text)
```tsx
<button type="button" className="text-gray-400 dark:text-gray-500">
  <div className="sr-only">Close</div>
```
**Used in**: `RecipientsModal`, `BulkUserImportModal`

### Animation System Conflicts

#### Standard (Headless UI Transition) - Most modals
```tsx
enter="transition ease-in-out duration-200"
enterFrom="opacity-0 translate-y-4"
```

#### MFA Dialogs (Different animation)
```tsx
enter="ease-out duration-300"
enterFrom="opacity-0 scale-95"
enterTo="opacity-100 scale-100"
// Also uses backdrop-blur-sm instead of standard backdrop
```

#### Fullscreen Chart Modals (Framer Motion)
```tsx
modalVariants: {
  animate: { opacity: 1, scale: 1, transition: { duration: 0.12 } }
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.1 } }
}
```

### Footer Pattern Variations

| Pattern | Structure | Files |
|---------|-----------|-------|
| No footer | Content fills space | DeleteConfirmationModal, DiscoveryProgressModal |
| Standard | `px-6 py-4 border-t bg-gray-50` | AddPracticeModal |
| Minimal | `px-6 py-4 border-t flex justify-end gap-3` | EditWorkItemModal |
| Complex | `justify-between` with stats + buttons | SchemaInstructionsModal |
| Navigation | Previous/Next + chart navigation | FullscreenModalFooter |

### Size Inconsistencies

```
max-w-md  (448px) - DiscoveryProgressModal
max-w-lg  (512px) - Standard modals (most common)
max-w-2xl (672px) - EditWorkItemModal, SchemaInstructionsModal
max-w-4xl (896px) - SchemaInstructionsModal (same component uses both!)
max-w-6xl/7xl     - Fullscreen chart modals
```

### Files Requiring Standardization

**Base/Template Files**:
- `/components/modal-basic.tsx`
- `/components/modal-blank.tsx`
- `/components/modal-action.tsx`
- `/components/crud-modal/index.tsx`

**High-Drift Implementations**:
- `/components/auth/mfa-setup-dialog.tsx` - Different animation, backdrop
- `/components/auth/mfa-verify-dialog.tsx` - Different animation, backdrop
- `/components/charts/chart-fullscreen-modal.tsx` - Framer Motion
- `/components/schema-instructions-modal.tsx` - Mixed sizing
- `/components/discovery-progress-modal.tsx` - Different max-width

**Should Use CrudModal**:
- `/components/add-practice-modal.tsx`
- `/components/edit-work-item-modal.tsx`
- `/components/bulk-user-import-modal.tsx`

### Recommended Solution

Consolidate to single `<Modal>` component:

```tsx
interface ModalProps {
  size: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'fullscreen';
  showHeader?: boolean;
  title?: string;
  subtitle?: string;
}

// Subcomponents
<Modal.Header />
<Modal.Body />
<Modal.Footer align="left" | "right" | "between" />
```

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

## 4. Loading/Skeleton States - Animation Mismatch

**Severity: HIGH** | **Files Affected: 70+** | **Effort: Medium**

### Problem Statement

Two conflicting animation patterns exist for loading states, plus naming conflicts and duplicate components.

### Animation Systems

#### System 1: `animate-shimmer` (Gradient-based)
```tsx
// From /components/ui/loading-skeleton.tsx
className="animate-shimmer bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200
           dark:from-slate-700 dark:via-slate-600 dark:to-slate-700
           bg-[length:200%_100%]"
```
**Used by**: `Skeleton`, `ChartSkeleton`, `TableSkeleton`, `CardSkeleton`, `FormSkeleton`, `DashboardSkeleton`

#### System 2: `animate-pulse` (Fade-based)
```tsx
className="animate-pulse bg-gray-200 dark:bg-gray-700"
```
**Found in 22+ inline implementations**

### Files Using `animate-pulse` (Should Migrate)

| File | Line | Context |
|------|------|---------|
| `/app/(default)/admin/command-center/components/skeleton.tsx` | Multiple | KPISkeleton, PanelSkeleton, ChartSkeleton |
| `/components/clinect-ratings-widget.tsx` | 100 | Loading ratings text |
| `/components/data-source-selector.tsx` | - | Loading state div |
| `/components/charts/dimension-comparison.tsx` | - | Overflow element |
| `/components/work-items/grade-history-table.tsx` | - | Loading space |
| `/components/work-items/work-item-breadcrumbs.tsx` | - | Loading gap |
| `/components/dynamic-field-renderer.tsx` | - | Attachment field |
| `/components/data-table/base-data-table.tsx` | - | Checkbox/loading cells |
| `/app/(default)/admin/command-center/components/redis-cache-stats.tsx` | - | Status indicator dot |
| `/app/(auth)/signin/page.tsx` | Multiple | Multiple skeleton elements |

### Naming Conflict: `ChartSkeleton`

**Definition 1**: `/components/ui/loading-skeleton.tsx`
- Uses `animate-shimmer` (gradient)
- Full-card shimmer for chart loading
- Exported from standard skeleton system

**Definition 2**: `/app/(default)/admin/command-center/components/skeleton.tsx`
- Uses `animate-pulse` (fade)
- Direct div with pulse animation
- Local to command center

**Impact**: Importing `ChartSkeleton` may get unexpected component depending on import path

### Duplicate Spinner Wrapper

| Component | File | Sizes | Features |
|-----------|------|-------|----------|
| `Spinner` | `/components/ui/spinner.tsx` | sm, md, lg, xl (presets) | Customizable colors, border |
| `LoadingSpinner` | `/components/ui/loading-skeleton.tsx` | sm, md, lg (different) | Text label, flex centering |

**Issue**: `LoadingSpinner` is a wrapper around `Spinner` but with different size naming:
- `Spinner` uses preset objects: `SPINNER_SIZES.sm` = `w-4 h-4`
- `LoadingSpinner` uses: `size="sm"` = `w-4 h-4` but via different prop

### Spinner Size Presets (From `/components/ui/spinner.tsx`)

```tsx
export const SPINNER_SIZES = {
  sm: { sizeClass: 'w-4 h-4', borderClass: 'border-2' },    // 16x16 - buttons
  md: { sizeClass: 'w-8 h-8', borderClass: 'border-3' },    // 32x32 - content
  lg: { sizeClass: 'w-12 h-12', borderClass: 'border-4' },  // 48x48 - modals
  xl: { sizeClass: 'w-16 h-16', borderClass: 'border-4' },  // 64x64 - fullscreen
};
```

### Files with Spinner Usage (51 total)

Key files importing `Spinner`:
- `/components/auth/mfa-setup-dialog.tsx` - size lg
- `/components/auth/mfa-verify-dialog.tsx` - size lg
- `/components/auth/login-form.tsx` - custom sizing with sm + md
- `/components/charts/dashboard-preview.tsx` - size md
- `/components/charts/analytics-progress-bar-chart.tsx` - size md
- `/components/work-items/attachments-list.tsx` - size md
- `/components/rbac/protected-page.tsx` - multiple instances

### Route-Level Loading States

| File | Component Used | Pattern |
|------|----------------|---------|
| `/app/(auth)/loading.tsx` | `AuthTransitionOverlay` | Fullscreen spinner |
| `/app/(default)/configure/loading.tsx` | `CardSkeleton`, `Skeleton` | Page structure |
| `/app/(default)/work/loading.tsx` | `TableSkeleton`, `Skeleton` | Table structure |

### Recommended Solution

1. **Standardize on `animate-shimmer`** - Migrate 22 `animate-pulse` instances
2. **Rename command center ChartSkeleton** to `CommandCenterChartSkeleton`
3. **Deprecate `LoadingSpinner`** - Use `Spinner` directly with flex wrapper
4. **Document size presets** - Use `SPINNER_SIZES` consistently

---

## 5. Form Fields - 3 Different Required Indicator Patterns

**Severity: HIGH** | **Files Affected: 20+** | **Effort: Medium**

### Problem Statement

CRUD modal fields are well-standardized, but standalone forms use 3 different patterns for required field indicators.

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

## 6. Cards/Panels - No Unified Card Component

**Severity: MEDIUM** | **Files Affected: 50+** | **Effort: Medium**

### Problem Statement

Cards are implemented inline with varying patterns for border radius, shadows, and structure.

### Existing Card Components

Only `GlassCard` exists as a reusable component:

**File**: `/components/ui/glass-card.tsx`
```tsx
// Glassmorphism effect
className="backdrop-blur-2xl backdrop-saturate-150
           bg-white/80 dark:bg-gray-800/80
           border border-white/30 dark:border-gray-600/30
           shadow-2xl rounded-2xl"
```

### Border Radius Variations

| Value | Usage | Files |
|-------|-------|-------|
| `rounded-lg` | Most common | Data tables, modals, buttons |
| `rounded-xl` | Cards, panels | Admin panels, configuration sections |
| `rounded-2xl` | Report cards, GlassCard | Report card components |
| `rounded-full` | Avatars, badges | Throughout |

**Issue**: No clear hierarchy for when to use which radius

### Shadow Variations

| Value | Usage | Files |
|-------|-------|-------|
| `shadow-sm` | Light elevation | Admin panels, data tables |
| `shadow-md` | Hover states | Staff member card |
| `shadow-lg` | Dropdowns | Dropdown menus |
| `shadow-xl` | Modals | Modal panels |
| `shadow-2xl` | GlassCard | Glass effect |

**Issue**: No consistent rule for elevation levels

### Border Color Variations

```tsx
// Pattern A (most common)
className="border-gray-200 dark:border-gray-700"

// Pattern B (with opacity)
className="border-gray-200 dark:border-gray-700/60"

// Pattern C
className="border-gray-300 dark:border-gray-600"
```

### Card Structure Patterns

#### Report Card Components
```tsx
// /components/report-card/engagement-card.tsx
<div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
  <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800">
    {/* Header */}
  </div>
  <div className="p-4 sm:p-6">
    {/* Content */}
  </div>
</div>
```

#### Admin Panel Pattern
```tsx
// /app/(default)/admin/command-center/components/error-log-panel.tsx
<div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
  {/* Content */}
</div>
```

#### Configuration Section Pattern
```tsx
// /app/(default)/configure/practices/[id]/sections/practice-info-section.tsx
<div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
  {/* Content */}
</div>
```

### Color Palette Inconsistency

**Most components**: Use `gray-*` palette
```tsx
className="bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100"
```

**Report card components**: Use `slate-*` palette
```tsx
className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
```

### Files with Card Patterns

**Report Card** (`/components/report-card/`):
- `overall-score-card.tsx` - Gradient backgrounds
- `engagement-card.tsx` - Header/content separation
- `insights-panel.tsx` - List with colored sub-cards

**Admin Panels** (`/app/(default)/admin/command-center/components/`):
- `error-log-panel.tsx`
- `at-risk-users-panel.tsx`
- `analytics-cache-datasource-card.tsx`

**Configuration** (`/app/(default)/configure/practices/[id]/sections/`):
- `practice-info-section.tsx`
- `branding-section.tsx`
- `contact-info-section.tsx`

### Recommended Solution

Create `/components/ui/card.tsx`:

```tsx
interface CardProps {
  variant: 'default' | 'elevated' | 'outlined' | 'glass';
  padding: 'none' | 'sm' | 'md' | 'lg';
}

// Subcomponents
<Card.Header />
<Card.Content />
<Card.Footer />
```

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
| Consolidate Modal components | 57+ | High | Pending |
| Create Badge component | 50+ (438 inline) | Medium | Pending |
| Standardize loading animations | 70+ | Medium | Pending |

### Phase 2: Medium Impact

| Task | Files Affected | Effort |
|------|----------------|--------|
| Create FormField wrapper | 20+ | Medium |
| Create Card component system | 50+ | Medium |
| Create Avatar component + utils | 15+ | Low |
| Standardize icon sizing | 146+ | Low |

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
| Modals | 57+ | - | Pending |
| Badges | 3 | 438+ inline | Pending |
| Loading | 8 | 22 animate-pulse | Pending |
| Form Fields | 10 CRUD + 10 standalone | - | Pending |
| Cards | 1 (GlassCard) | 50+ inline | Pending |
| Error/Empty | 5 | 30+ inline | Pending |
| Tables | 17 | - | Pending |
| Avatars | 0 | 15+ inline | Pending |
| Tooltips | 12 | - | Pending |
| Navigation | 20+ | - | Pending |
| Icons | 0 constants | 146+ usages | Pending |
| Alerts | 4 | 202 inline | Pending |
| Typography | 0 | - | Pending |
| Pagination | 2 | - | Pending |
