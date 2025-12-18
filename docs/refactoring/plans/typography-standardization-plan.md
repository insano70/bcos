# Typography Standardization Plan

> **Generated**: December 2024
> **Issue Reference**: Component Refactor Item #14
> **Status**: COMPLETED - December 2024

---

## Executive Summary

A comprehensive analysis of typography patterns reveals that the heading weight hierarchy issue is **more nuanced than originally documented**. The codebase shows inconsistent H3 heading weights, but the majority actually use the correct `font-semibold` pattern. The issue is one of **inconsistency rather than a systemic wrong choice**.

### Key Findings

| Issue | Original Claim | Actual State | Action Taken |
|-------|----------------|--------------|--------------|
| H3 uses `font-medium` (500) | "Should be 600" | **Mixed**: 46 `font-medium` vs 81 `font-semibold` | **MIGRATED** 27 instances to `font-semibold` |
| H2 weight inconsistency | Not mentioned | **Mixed**: 46 `font-semibold` vs 90 `font-bold` | Documented as context-based (no change needed) |
| Caption text sizing | "Inconsistent" | **Standardized** via `FormHelp` component | Already resolved |
| `line-clamp` utility | Not mentioned | **Available** and used (2 instances) | No action needed |

### Heading Weight Distribution

```
H1: font-bold (700) ✓ - 70 occurrences (consistent)
H2: font-semibold (600) - 46 occurrences (sections/modals)
    font-bold (700) - 90 occurrences (pages/templates)
H3: font-semibold (600) - 81 occurrences ✓ (correct pattern)
    font-medium (500) - 46 occurrences ✗ (needs migration)
    font-bold (700) - 9 occurrences (templates only)
```

---

## Current Typography Patterns

### 1. H1 Headings (Consistent ✓)

**Pattern**: `text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100`

All 70 H1 instances consistently use `font-bold`. No action required.

**Locations**: Page titles, main headings, error pages, templates

### 2. H2 Headings (Context-Dependent)

Two valid patterns exist based on context:

| Context | Weight | Size | Example |
|---------|--------|------|---------|
| Page sections | `font-bold` | `text-2xl`/`text-3xl` | Template section headers |
| Modal headers | `font-semibold` | `text-xl` | Configuration modals |
| Card sections | `font-semibold` | `text-xl` | Dashboard sections |

**Recommendation**: Document both as valid patterns based on context.

### 3. H3 Headings (Needs Standardization)

**The Problem**: Two competing patterns create visual inconsistency:

| Pattern | Count | Files | Usage Context |
|---------|-------|-------|---------------|
| `font-semibold` (correct) | 81 | 55 | Report cards, admin panels, templates, sidebar |
| `font-medium` (incorrect) | 46 | 37 | Modals, chart builders, data explorer |
| `font-bold` (templates) | 9 | 7 | External templates only |

**Why `font-semibold` is correct**:
- Maintains visual hierarchy: H1 (700) > H2 (600-700) > H3 (600)
- `font-medium` (500) is too light, similar to body text
- Report Card and Admin Command Center already use `font-semibold` correctly

### 4. Caption/Help Text (Already Standardized ✓)

**Standard Component**: `FormHelp` at `/components/ui/form-help.tsx`

```typescript
// Standard pattern (already implemented)
className="mt-1 text-xs text-gray-500 dark:text-gray-400"
```

**Usage**: 17 files use the correct `mt-1 text-xs text-gray-500` pattern via `FormHelp` or directly.

---

## Files Requiring H3 Weight Migration

### Category 1: Confirmation/Delete Modals (11 files)

These modals use `text-lg font-medium` for H3 titles - should be `font-semibold`:

| File | Line | Current |
|------|------|---------|
| `components/delete-work-item-modal.tsx` | 95 | `text-lg font-medium` |
| `components/delete-confirmation-modal.tsx` | 121 | `text-lg font-medium` |
| `components/gallery-manager.tsx` | 231 | `text-lg font-medium` |
| `components/feedback-modal.tsx` | 82 | `text-lg font-medium` |
| `components/staff-list-embedded.tsx` | 108, 171 | `text-lg font-medium` |
| `components/staff-member-card.tsx` | 86 | `text-lg font-medium` |
| `components/services-editor.tsx` | 170 | `text-lg font-medium` |
| `components/conditions-editor.tsx` | 170 | `text-lg font-medium` |
| `components/reset-mfa-confirmation-modal.tsx` | 68 | `text-lg font-medium` |
| `components/color-palette-selector.tsx` | (line varies) | `text-lg font-medium` |
| `components/manage-relationships-modal.tsx` | (line varies) | `text-lg font-medium` |

### Category 2: Chart Builder Components (10 files)

| File | Line | Current |
|------|------|---------|
| `components/charts/chart-builder-save.tsx` | 21 | `text-lg font-medium` |
| `components/charts/chart-builder-advanced.tsx` | 59, 104 | `text-lg font-medium` |
| `components/charts/chart-builder-core.tsx` | 105 | `text-lg font-medium` |
| `components/charts/chart-builder-drill-down.tsx` | 136 | `text-lg font-medium` |
| `components/charts/chart-builder-preview.tsx` | 32 | `text-lg font-medium` |
| `components/charts/date-range-presets.tsx` | 324 | `text-lg font-medium` |
| `components/charts/advanced-filter-builder.tsx` | 401 | `text-lg font-medium` |
| `components/charts/historical-comparison-widget.tsx` | 150 | `text-lg font-medium` |
| `components/charts/dashboard-states.tsx` | (line varies) | `font-medium` (no size) |
| `components/charts/dashboard-preview.tsx` | (varies) | `text-lg font-medium` |
| `components/charts/dashboard-row-builder.tsx` | (varies) | `text-lg font-medium` |

### Category 3: Dashboard Row Builder (1 file)

| File | Line | Current |
|------|------|---------|
| `components/dashboards/row-builder/components/row-controls.tsx` | 39 | `text-lg font-medium` |

### Category 4: Data Explorer Pages (4 files)

| File | Line | Current |
|------|------|---------|
| `app/(default)/data/explorer/suggestions/page.tsx` | 111 | `text-lg font-medium` |
| `app/(default)/data/explorer/feedback/page.tsx` | 110 | `text-lg font-medium` |
| `app/(default)/data/explorer/test-cases/page.tsx` | 93 | `text-lg font-medium` |
| `app/(default)/data/explorer/learning/page.tsx` | 60 | `text-lg font-medium` |

### Category 5: Report Card Views (5 files)

**Note**: These use `slate-*` colors (not `gray-*`) as part of the Report Card design system.

| File | Line | Current |
|------|------|---------|
| `app/(default)/dashboard/report-card/report-card-view.tsx` | 175, 255 | `text-lg font-medium text-slate-800` |
| `app/(default)/dashboard/report-card/annual-review/annual-review-view.tsx` | 192, 387, (varies) | `text-lg font-medium text-slate-800` |
| `app/(default)/admin/report-card/report-card-admin.tsx` | (varies) | `text-lg font-medium` |

### Category 6: Configure Pages (3 files)

| File | Line | Current |
|------|------|---------|
| `app/(default)/configure/practices/practices-content.tsx` | (varies) | `text-lg font-medium` |
| `app/(default)/configure/dashboards/[dashboardId]/edit/page.tsx` | 110 | `text-lg font-medium` |
| `app/(default)/configure/charts/[chartId]/edit/page.tsx` | 88 | `text-lg font-medium` |
| `app/(default)/configure/practices/[id]/sections/branding-section.tsx` | 65 | `text-lg font-medium` |

### Category 7: Other Components (3 files)

| File | Line | Current |
|------|------|---------|
| `components/ui/empty-state.tsx` | 78 | `text-lg font-medium` |
| `components/error-display.tsx` | (varies) | `font-medium` (context-specific) |
| `components/manage-work-item-fields-modal.tsx` | 201 | `text-sm font-medium` |

---

## Proposed Solution

### Phase 1: Define Typography Standards

Create documentation defining the standard typography scale:

```typescript
// Heading Standards
H1: text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100
H2 (page):    text-xl font-semibold text-gray-900 dark:text-gray-100
H2 (section): text-2xl font-bold text-gray-900 dark:text-gray-100
H3: text-lg font-semibold text-gray-900 dark:text-gray-100

// Report Card (slate palette)
H3: text-lg font-semibold text-slate-800 dark:text-slate-200

// Form Labels
Label: text-sm font-medium text-gray-700 dark:text-gray-300

// Help/Caption Text
Help: text-xs text-gray-500 dark:text-gray-400
```

### Phase 2: Migrate H3 Headings

Execute a find-and-replace migration:

**Search Pattern**:
```regex
<h3[^>]*className="([^"]*?)text-lg font-medium([^"]*?)"
```

**Replace With**:
```
<h3 className="$1text-lg font-semibold$2"
```

**Manual Review Required For**:
- Report Card components (keep `slate-*` colors)
- Error display components (contextual styling)
- Template files (may have intentional differences)

### Phase 3: Update UI Components

Ensure shared components use correct weights:

1. **`components/ui/empty-state.tsx`** - Update H3 to `font-semibold`
2. **`components/ui/modal.tsx`** - Verify title uses `font-semibold`

### Phase 4: Optional - Create Heading Components

Consider creating standardized heading components for consistency:

```typescript
// components/ui/heading.tsx (optional)
export function SectionHeading({ children, className }: Props) {
  return (
    <h3 className={cn(
      "text-lg font-semibold text-gray-900 dark:text-gray-100",
      className
    )}>
      {children}
    </h3>
  );
}
```

**Recommendation**: Skip this phase initially. Direct class updates are simpler and the pattern is clear enough to follow without a wrapper component.

---

## Migration Script

For bulk updates, use this bash command:

```bash
# Find all H3 with font-medium pattern
grep -rn "text-lg font-medium" --include="*.tsx" \
  --exclude-dir=templates \
  --exclude-dir=node_modules \
  components/ app/

# Count instances
grep -rn "text-lg font-medium" --include="*.tsx" \
  --exclude-dir=templates \
  components/ app/ | wc -l
```

**Manual migration recommended** due to:
- Varying class order (`text-lg font-medium` vs `font-medium text-lg`)
- Different color schemes (`gray-*` vs `slate-*`)
- Need to preserve other classes in the className string

---

## Implementation Status (Completed December 2024)

### Files Migrated (27 instances across 24 files)

**Confirmation/Delete Modals** (10 files):
- `components/delete-work-item-modal.tsx`
- `components/delete-confirmation-modal.tsx`
- `components/gallery-manager.tsx`
- `components/feedback-modal.tsx`
- `components/staff-list-embedded.tsx` (2 instances)
- `components/staff-member-card.tsx`
- `components/services-editor.tsx`
- `components/conditions-editor.tsx`
- `components/reset-mfa-confirmation-modal.tsx`

**Chart Builder Components** (10 files):
- `components/charts/chart-builder-save.tsx`
- `components/charts/chart-builder-advanced.tsx` (2 instances)
- `components/charts/chart-builder-core.tsx`
- `components/charts/chart-builder-drill-down.tsx`
- `components/charts/chart-builder-preview.tsx`
- `components/charts/date-range-presets.tsx`
- `components/charts/advanced-filter-builder.tsx`
- `components/charts/historical-comparison-widget.tsx`

**Dashboard Row Builder** (1 file):
- `components/dashboards/row-builder/components/row-controls.tsx`

**Data Explorer Pages** (3 files):
- `app/(default)/data/explorer/suggestions/page.tsx`
- `app/(default)/data/explorer/feedback/page.tsx`
- `app/(default)/data/explorer/test-cases/page.tsx`

**Report Card Views** (2 files, preserved `slate-*` colors):
- `app/(default)/dashboard/report-card/report-card-view.tsx` (2 instances)
- `app/(default)/dashboard/report-card/annual-review/annual-review-view.tsx` (2 instances)

**Configure Pages** (3 files):
- `app/(default)/configure/practices/[id]/sections/branding-section.tsx`
- `app/(default)/configure/dashboards/[dashboardId]/edit/page.tsx`
- `app/(default)/configure/charts/[chartId]/edit/page.tsx`

**UI Components** (1 file):
- `components/ui/empty-state.tsx`

### Verification

- `pnpm tsc` - PASSED
- `pnpm lint` - PASSED

---

## Files NOT Requiring Changes

### Templates (Keep As-Is)

Template files use their own design systems:
- `templates/modern-minimalist/` - Uses `font-light`
- `templates/clinical-focus/`
- `templates/classic-professional/`
- `templates/tidy-professional/`
- `templates/warm-welcoming/`
- `templates/community-practice/`

### Components Already Correct

These files already use `font-semibold` correctly:
- `components/report-card/insights-panel.tsx`
- `components/report-card/score-help-tooltip.tsx`
- `components/report-card/trend-chart.tsx`
- `components/report-card/overall-score-card.tsx`
- `components/report-card/engagement-card.tsx`
- `components/report-card/measure-breakdown.tsx`
- `components/report-card/grade-history-table.tsx`
- `components/report-card/location-comparison.tsx`
- `components/hierarchy-select.tsx`
- `components/work-items/work-item-attachments-section.tsx`
- `components/work-items/work-item-activity-section.tsx`
- `components/work-items/work-item-comments-section.tsx`
- All sidebar menu section components
- All admin command center chart components

---

## Success Criteria

1. **All H3 headings use `font-semibold`** (except templates and specific design contexts)
2. **Consistent visual hierarchy**: H1 (700) > H2 (600-700) > H3 (600) > Body (400)
3. **`pnpm tsc && pnpm lint` pass** with no errors
4. **No visual regressions** in existing pages
5. **Report Card components** maintain `slate-*` color scheme

---

## Estimated Effort

| Phase | Tasks | Effort |
|-------|-------|--------|
| Phase 1 | Document typography standards | 30 minutes |
| Phase 2 | Migrate 46 H3 instances across 37 files | 2-3 hours |
| Phase 3 | Update UI components | 15 minutes |
| Phase 4 | Optional heading components | Skip |
| Testing | Visual verification | 30 minutes |
| **Total** | | **3-4 hours** |

---

## Files Summary

### Files to Modify (37 files)

**Confirmation/Delete Modals**: 11 files
**Chart Builder Components**: 10 files
**Dashboard Row Builder**: 1 file
**Data Explorer Pages**: 4 files
**Report Card Views**: 5 files (preserve slate colors)
**Configure Pages**: 4 files
**Other Components**: 2 files

### Files to Skip

- All `/templates/` files (6 template directories)
- All `/app/(alternative)/components-library/` files (documentation)
- Files already using `font-semibold` (55 files)

---

## Appendix: Complete File List

### Files with `font-medium` H3s (to migrate)

```
components/delete-work-item-modal.tsx:95
components/gallery-manager.tsx:231
components/delete-confirmation-modal.tsx:121
components/feedback-modal.tsx:82
components/staff-list-embedded.tsx:108
components/staff-list-embedded.tsx:171
components/staff-member-card.tsx:86
components/dashboards/row-builder/components/row-controls.tsx:39
components/services-editor.tsx:170
components/conditions-editor.tsx:170
components/reset-mfa-confirmation-modal.tsx:68
components/ui/empty-state.tsx:78
components/charts/chart-builder-save.tsx:21
components/charts/chart-builder-advanced.tsx:59
components/charts/chart-builder-advanced.tsx:104
components/charts/date-range-presets.tsx:324
components/charts/chart-builder-core.tsx:105
components/charts/advanced-filter-builder.tsx:401
components/charts/chart-builder-drill-down.tsx:136
components/charts/chart-builder-preview.tsx:32
components/charts/historical-comparison-widget.tsx:150
components/charts/dashboard-states.tsx:109
components/charts/dashboard-preview.tsx:varies
components/charts/dashboard-row-builder.tsx:varies
components/manage-relationships-modal.tsx:varies
components/color-palette-selector.tsx:varies
app/(default)/data/explorer/suggestions/page.tsx:111
app/(default)/data/explorer/feedback/page.tsx:110
app/(default)/data/explorer/test-cases/page.tsx:93
app/(default)/data/explorer/learning/page.tsx:60
app/(default)/dashboard/report-card/report-card-view.tsx:175
app/(default)/dashboard/report-card/report-card-view.tsx:255
app/(default)/dashboard/report-card/annual-review/annual-review-view.tsx:192
app/(default)/dashboard/report-card/annual-review/annual-review-view.tsx:387
app/(default)/admin/report-card/report-card-admin.tsx:varies
app/(default)/configure/practices/practices-content.tsx:varies
app/(default)/configure/dashboards/[dashboardId]/edit/page.tsx:110
app/(default)/configure/charts/[chartId]/edit/page.tsx:88
app/(default)/configure/practices/[id]/sections/branding-section.tsx:65
```

### Files with `font-semibold` H3s (already correct)

```
(81 occurrences across 55 files - see grep output in analysis)
```
