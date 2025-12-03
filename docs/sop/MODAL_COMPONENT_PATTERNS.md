# Modal Component Patterns

## Overview

This document defines the standard patterns for modal components in the application. Following these patterns ensures consistent UX, accessibility, and maintainability.

## Modal Types

### 1. Generic Delete Confirmation Modal

**Component:** `DeleteConfirmationModal`
**Location:** `@/components/delete-confirmation-modal`

Use for simple delete confirmations without domain-specific logic.

```typescript
import DeleteConfirmationModal from '@/components/delete-confirmation-modal';

<DeleteConfirmationModal
  isOpen={deleteModalOpen}
  setIsOpen={setDeleteModalOpen}
  title="Delete Chart"
  itemName={chartToDelete.chart_name}
  confirmButtonText="Delete Chart"
  onConfirm={async () => await handleDeleteConfirm(chartToDelete.chart_definition_id)}
/>
```

**Features:**
- Consistent red warning design
- Loading state during deletion
- Error handling via `clientErrorLog`
- Optional children for additional content

**With additional warning content:**
```typescript
<DeleteConfirmationModal
  isOpen={isOpen}
  setIsOpen={setIsOpen}
  title="Delete Work Item"
  itemName={workItemSubject}
  onConfirm={handleDelete}
>
  <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded mb-4">
    <p className="text-sm text-yellow-700">
      This will also delete {childCount} child items.
    </p>
  </div>
</DeleteConfirmationModal>
```

### 2. Specialized Delete Modals

For modals with complex domain logic (impact assessment, custom Toast handling, specific warnings), create specialized components:

**Examples:**
- `delete-data-source-modal.tsx` - Warns about dependent charts/dashboards
- `delete-work-item-modal.tsx` - Shows impact assessment (children, comments, attachments)
- `delete-data-source-column-modal.tsx` - Shows calculated field dependencies

**When to use specialized vs generic:**
| Use Generic | Use Specialized |
|-------------|-----------------|
| Simple "are you sure?" confirmation | Custom warning content based on API data |
| No domain-specific validation | Impact assessment queries |
| Standard success/error handling | Custom Toast messages |
| No pre-deletion checks | Pre-deletion dependency checks |

### 3. Fullscreen Chart Modals

**Hook:** `useChartFullscreen`
**Location:** `@/hooks/useChartFullscreen`

For fullscreen modal functionality in chart components, use the shared hook:

```typescript
import { useChartFullscreen } from '@/hooks/useChartFullscreen';

function MyFullscreenModal({ isOpen, onClose, ...props }) {
  const { mounted } = useChartFullscreen(isOpen, onClose);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900">
      {/* Modal content */}
    </div>,
    document.body
  );
}
```

**The hook handles:**
- Client-side mounting for SSR compatibility
- Body scroll locking when open
- Escape key handling
- Cleanup on unmount

**Existing implementations:**
- `chart-fullscreen-modal.tsx`
- `dual-axis-fullscreen-modal.tsx`
- `progress-bar-fullscreen-modal.tsx`

### 4. Form Modals

**Base Component:** `ModalBasic`
**Location:** `@/components/modal-basic`

For modals containing forms:

```typescript
import ModalBasic from '@/components/modal-basic';

<ModalBasic
  isOpen={isOpen}
  setIsOpen={setIsOpen}
  title="Edit User"
>
  <form onSubmit={handleSubmit}>
    {/* Form fields */}
    <div className="flex justify-end gap-3 mt-6">
      <button type="button" onClick={() => setIsOpen(false)}>Cancel</button>
      <button type="submit">Save</button>
    </div>
  </form>
</ModalBasic>
```

### 5. CRUD Modals

**Component:** `CrudModal`
**Location:** `@/components/crud-modal`

For standardized create/edit modals with schema validation:

```typescript
import CrudModal from '@/components/crud-modal';

<CrudModal
  isOpen={isOpen}
  setIsOpen={setIsOpen}
  mode={editingItem ? 'edit' : 'create'}
  resourceName="User"
  fields={[
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'name', label: 'Name', type: 'text', required: true },
  ]}
  schema={userSchema}
  initialData={editingItem}
  onSubmit={handleSubmit}
/>
```

## Accessibility Requirements

All modals MUST include:

1. **Focus trap** - Focus stays within modal when open
2. **Escape key handling** - Close on Escape press
3. **ARIA attributes** - `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
4. **Focus restoration** - Return focus to trigger element on close

The base components (`ModalBasic`, `DeleteConfirmationModal`) handle these automatically.

## Error Handling Pattern

```typescript
const handleConfirm = async () => {
  try {
    setIsDeleting(true);
    await onConfirm();
    setIsOpen(false);
  } catch (error) {
    clientErrorLog('Operation failed:', error);
    // Parent component handles user-facing error display
  } finally {
    setIsDeleting(false);
  }
};
```

## Do NOT Create New Modals For:

- Simple confirmations (use `DeleteConfirmationModal`)
- Basic forms (use `CrudModal` or `ModalBasic`)
- Fullscreen charts (use `useChartFullscreen` hook)

Only create specialized modals when domain-specific logic requires it.

## Related Documentation

- `components/modal-basic.tsx` - Base modal implementation
- `components/delete-confirmation-modal.tsx` - Generic delete modal
- `hooks/useChartFullscreen.ts` - Fullscreen modal hook
- `components/crud-modal/` - CRUD modal system

---
*Last updated: December 2024*
*Established during codebase refactoring initiative*

