# Sub-Items Editable Table UI - Detailed Technical Specification

**Version**: 1.0
**Date**: 2025-01-26
**Status**: Planning Phase

---

## Table of Contents

1. [Overview](#overview)
2. [Problem Statement](#problem-statement)
3. [Goals & Requirements](#goals--requirements)
4. [Architecture](#architecture)
5. [Component Specifications](#component-specifications)
6. [State Management](#state-management)
7. [API Integration](#api-integration)
8. [User Flows](#user-flows)
9. [Visual Design Specifications](#visual-design-specifications)
10. [Implementation Plan](#implementation-plan)
11. [Testing Strategy](#testing-strategy)
12. [Future Enhancements](#future-enhancements)

---

## Overview

This document outlines the complete redesign of the work item sub-items tab, transforming it from a card-based read-only display into an **inline-editable data table** that enables rapid creation and editing of multiple child work items simultaneously.

### Current State

**Location**: `app/(default)/work/[id]/work-item-detail-content.tsx` (Sub-items tab)

**Current Implementation**:
- Card-based layout showing child work items
- Click card → navigate to child detail page to edit
- Add sub-item → opens modal → create one at a time
- Sidebar shows hierarchy section and details block
- Limited bulk operations

**Pain Points**:
- Slow workflow for creating multiple children
- Cannot see/edit multiple children simultaneously
- Must navigate away from parent to edit children
- Excessive clicking for common operations
- Cards take up significant vertical space

### Proposed State

**New Implementation**:
- Inline-editable data table with spreadsheet-like interaction
- Each row is a child work item with editable cells
- "Add Sub-Item" button creates stub work items instantly (rapid clicking supported)
- Multi-row editing with explicit save/cancel per row
- Full-width table (sidebar hidden on sub-items tab)
- Expandable rows for description and custom fields
- Keyboard navigation support (Tab, Enter, Escape)
- Pagination with 50 items per page
- Hierarchy preserved via breadcrumbs and visual indicators

---

## Problem Statement

Users need to create and manage **multiple related child work items** efficiently. Current modal-based workflow requires:
- 8-10 clicks per child work item creation
- Navigation away from parent context
- Re-opening modals repeatedly
- No batch editing capabilities

**Target Workflow**:
- 2 clicks to create stub child (click "Add Sub-Item", click in subject cell to type)
- Edit multiple children without leaving parent context
- Bulk operations on selected children
- Keyboard-driven data entry

---

## Goals & Requirements

### Functional Requirements

**Must Have (P0)**:
1. ✅ Inline editing for core work item fields (Subject, Status, Priority, Assignee, Due Date)
2. ✅ Rapid stub creation (click button multiple times → multiple blank rows appear)
3. ✅ Multi-row edit mode (edit rows 1, 3, 5 simultaneously)
4. ✅ Explicit save/cancel per row (no auto-save initially)
5. ✅ Type selector per row (support multiple child types in same table)
6. ✅ Visual states for edit mode, unsaved changes, errors
7. ✅ Pagination (50 items/page, navigate to see all)
8. ✅ Delete row action (soft delete)
9. ✅ Preserve hierarchy context (breadcrumbs showing parent chain)
10. ✅ Full-width table (hide sidebar on sub-items tab)

**Should Have (P1)**:
1. ⚡ Expandable rows for description, custom fields, mini-comments/attachments
2. ⚡ Keyboard navigation (Tab between fields, Enter to save, Escape to cancel)
3. ⚡ Bulk actions (select multiple rows → change status, assignee, delete)
4. ⚡ Optimistic UI updates (instant feedback, revert on error)
5. ⚡ Unsaved changes warning on navigation
6. ⚡ Loading states and skeletons
7. ⚡ Navigate to detail page action (icon/button per row)

**Nice to Have (P2)**:
- Auto-save after debounce (future enhancement)
- Drag-to-reorder rows (if display_order field exists)
- Inline filtering by status/type/assignee
- Column sorting
- Export to CSV
- Keyboard shortcuts (Ctrl+S to save all)

### Non-Functional Requirements

**Performance**:
- Table renders <500ms for 50 rows
- Stub creation completes <200ms server-side
- Optimistic updates feel instant (<50ms)
- Pagination prevents DOM overload

**Accessibility**:
- ARIA labels for all interactive elements
- Keyboard navigation for all actions
- Focus management (edit mode → focus first input)
- Screen reader support

**Security**:
- All API calls use `rbacRoute` with `work-items:create/update/delete` permissions
- Input sanitization (existing `createSafeTextSchema`)
- CSRF protection (existing)
- Rate limiting (existing `api` tier - 100 req/min)

**Data Integrity**:
- Validation before save (Zod schemas)
- Optimistic updates with rollback on error
- Concurrent edit detection (future: use `updated_at` timestamp check)

---

## Architecture

### Component Hierarchy

```
app/(default)/work/[id]/work-item-detail-content.tsx
└─ Sub-items Tab
   ├─ WorkItemHierarchyBreadcrumbs (new)
   │  └─ Shows parent chain for context
   └─ EditableWorkItemsTable (new)
      ├─ Toolbar
      │  ├─ "Add Sub-Item" button
      │  ├─ Bulk action buttons (when rows selected)
      │  └─ Pagination controls (top)
      ├─ EditableDataTable (generic reusable component)
      │  ├─ Table Header
      │  │  ├─ Select All checkbox
      │  │  ├─ Column headers (Type, Subject, Status, Priority, Assignee, Due Date, Actions)
      │  │  └─ Sort icons (future)
      │  └─ Table Body
      │     └─ EditableTableRow[] (one per work item)
      │        ├─ Display Mode
      │        │  ├─ Checkbox cell
      │        │  ├─ Data cells (text, badges, user avatar)
      │        │  ├─ Actions cell (Edit, Delete, Expand, Navigate buttons)
      │        │  └─ Expandable content (when expanded)
      │        └─ Edit Mode
      │           ├─ Checkbox cell (disabled in edit)
      │           ├─ Input cells (text input, dropdowns, date picker, user picker)
      │           ├─ Actions cell (Save, Cancel buttons)
      │           └─ Inline validation errors (below inputs)
      └─ Pagination controls (bottom)
```

### File Structure

**New Files**:
```
components/editable-data-table.tsx              # Generic editable table component
  - EditableDataTableProps interface
  - Column definitions with edit mode support
  - Row state management (edit mode, unsaved changes)
  - Keyboard navigation logic
  - Bulk selection handling

components/editable-table-row.tsx               # Individual row component
  - EditableTableRowProps interface
  - Display vs Edit mode rendering
  - Save/Cancel/Delete handlers
  - Validation state display
  - Expandable content toggle

components/editable-work-items-table.tsx        # Work items specialization
  - Work item column definitions
  - Integration with useWorkItemChildren hook
  - Stub creation handler
  - Type relationship filtering
  - Bulk action handlers

components/work-items/work-item-hierarchy-breadcrumbs.tsx
  - Uses useWorkItemAncestors hook
  - Displays parent chain with links
  - Compact horizontal layout

components/work-items/sub-items-editable-section.tsx (optional wrapper)
  - Combines breadcrumbs + editable table
  - Manages sub-items tab state
  - Handles navigation warnings
```

**Modified Files**:
```
app/(default)/work/[id]/work-item-detail-content.tsx
  - Replace card-based sub-items display (lines 344-420)
  - Add conditional sidebar hiding when activeTab === 'sub-items'
  - Import new SubItemsEditableSection component

lib/hooks/use-work-items.ts
  - Add useCreateWorkItemStub hook (or extend useCreateWorkItem)
  - Optimistic update configuration

lib/validations/work-items.ts
  - Add workItemQuickUpdateSchema (subset of fields for inline edit)
  - Ensure validation errors are field-specific for inline display
```

---

## Component Specifications

### 1. EditableDataTable (Generic Component)

**File**: `components/editable-data-table.tsx`

**Purpose**: Reusable table component supporting inline editing for any data type.

**TypeScript Interface**:
```typescript
export interface EditableColumn<T> {
  key: keyof T | 'checkbox' | 'actions' | 'expand';
  header?: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  className?: string;
  width?: string; // e.g., '200px', '30%', 'auto'

  // Display mode rendering
  render?: (item: T) => ReactNode;

  // Edit mode rendering
  renderEdit?: (
    item: T,
    value: unknown,
    onChange: (value: unknown) => void,
    error?: string
  ) => ReactNode;

  // Field metadata
  editable?: boolean; // Default: false for checkbox/actions, true for data columns
  required?: boolean;
  validate?: (value: unknown, item: T) => string | undefined; // Return error message
}

export interface EditableDataTableProps<T extends { id: string }> {
  title: string;
  data: T[];
  columns: EditableColumn<T>[];

  // Edit mode callbacks
  onSave?: (item: T, changes: Partial<T>) => Promise<void>;
  onDelete?: (item: T) => Promise<void>;
  onCancel?: (item: T) => void;

  // Row expansion
  expandable?: {
    render: (item: T) => ReactNode;
  };

  // Bulk actions
  bulkActions?: DataTableBulkAction<T>[];

  // UI configuration
  pagination?: {
    itemsPerPage?: number;
  };
  emptyState?: {
    title: string;
    description?: string;
    icon?: ReactNode;
  };
  isLoading?: boolean;

  // Edit mode configuration
  allowMultiEdit?: boolean; // Default: true
  unsavedChangesWarning?: boolean; // Default: true
  keyboardNavigation?: boolean; // Default: true

  // Row state overrides (for optimistic updates)
  editingRows?: Set<string>; // Row IDs in edit mode
  savingRows?: Set<string>; // Row IDs currently saving
  errorRows?: Map<string, string>; // Row ID → error message
}
```

**State Management**:
```typescript
// Internal state
const [editingRows, setEditingRows] = useState<Set<string>>(new Set());
const [unsavedChanges, setUnsavedChanges] = useState<Map<string, Partial<T>>>(new Map());
const [validationErrors, setValidationErrors] = useState<Map<string, Record<string, string>>>(new Map());
const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
const [savingRows, setSavingRows] = useState<Set<string>>(new Set());
```

**Key Methods**:
```typescript
const enterEditMode = (rowId: string) => {
  setEditingRows(prev => new Set([...prev, rowId]));
  // Focus first editable input
};

const exitEditMode = (rowId: string) => {
  setEditingRows(prev => {
    const next = new Set(prev);
    next.delete(rowId);
    return next;
  });
  setUnsavedChanges(prev => {
    const next = new Map(prev);
    next.delete(rowId);
    return next;
  });
};

const handleSave = async (rowId: string) => {
  const item = data.find(d => d.id === rowId);
  const changes = unsavedChanges.get(rowId);

  if (!item || !changes) return;

  // Validate
  const errors = validateRow(item, changes);
  if (Object.keys(errors).length > 0) {
    setValidationErrors(prev => new Map(prev).set(rowId, errors));
    return;
  }

  // Save
  setSavingRows(prev => new Set([...prev, rowId]));
  try {
    await onSave?.(item, changes);
    exitEditMode(rowId);
  } catch (error) {
    // Handle error (show toast, set error state)
  } finally {
    setSavingRows(prev => {
      const next = new Set(prev);
      next.delete(rowId);
      return next;
    });
  }
};

const handleCancel = (rowId: string) => {
  exitEditMode(rowId);
  setValidationErrors(prev => {
    const next = new Map(prev);
    next.delete(rowId);
    return next;
  });
  onCancel?.(data.find(d => d.id === rowId)!);
};
```

**Keyboard Navigation**:
```typescript
const handleKeyDown = (e: KeyboardEvent, rowId: string, fieldKey: string) => {
  switch (e.key) {
    case 'Enter':
      if (e.metaKey || e.ctrlKey) {
        // Save row
        handleSave(rowId);
      }
      break;
    case 'Escape':
      // Cancel edit
      handleCancel(rowId);
      break;
    case 'Tab':
      // Move to next field (handle by focus management)
      break;
  }
};
```

---

### 2. EditableTableRow (Row Component)

**File**: `components/editable-table-row.tsx`

**Purpose**: Renders a single row in display or edit mode with state indicators.

**TypeScript Interface**:
```typescript
export interface EditableTableRowProps<T extends { id: string }> {
  item: T;
  columns: EditableColumn<T>[];
  isEditing: boolean;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  changes: Partial<T>;
  errors: Record<string, string>;

  // Callbacks
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onChange: (key: keyof T, value: unknown) => void;
  onToggleExpand: () => void;
  onToggleSelect: (checked: boolean) => void;

  // Expansion content
  expandableContent?: ReactNode;

  // Navigation
  onNavigate?: () => void;
}
```

**Visual States**:
```typescript
const getRowClassName = () => {
  const baseClasses = 'border-b border-gray-100 dark:border-gray-700';

  if (isEditing) {
    return `${baseClasses} bg-blue-50 dark:bg-blue-900/10 border-l-4 border-l-blue-500`;
  }

  if (hasUnsavedChanges) {
    return `${baseClasses} border-l-4 border-l-orange-500`;
  }

  return baseClasses;
};
```

**Rendering Logic**:
```typescript
return (
  <>
    <tr className={getRowClassName()}>
      {/* Expand toggle (if expandable) */}
      {expandableContent && (
        <td className="px-2 first:pl-5 w-px">
          <button onClick={onToggleExpand}>
            <ChevronIcon className={isExpanded ? 'rotate-90' : ''} />
          </button>
        </td>
      )}

      {/* Checkbox (if selectable) */}
      <td className="px-2 w-px">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onToggleSelect(e.target.checked)}
          disabled={isEditing}
        />
      </td>

      {/* Data columns */}
      {columns.map(col => (
        <td key={String(col.key)} className={col.className}>
          {isEditing && col.editable ? (
            <div>
              {col.renderEdit?.(item, changes[col.key] ?? item[col.key], (val) => onChange(col.key, val), errors[String(col.key)])}
              {errors[String(col.key)] && (
                <p className="text-xs text-red-600 mt-1">{errors[String(col.key)]}</p>
              )}
            </div>
          ) : (
            col.render?.(item)
          )}
        </td>
      ))}

      {/* Actions column */}
      <td className="px-2 last:pr-5 w-px">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <button
              onClick={onSave}
              disabled={isSaving}
              className="btn-sm bg-blue-500 text-white"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={onCancel}
              disabled={isSaving}
              className="btn-sm bg-gray-200"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={onEdit} className="btn-sm">
              Edit
            </button>
            <button onClick={onDelete} className="btn-sm text-red-600">
              Delete
            </button>
            {onNavigate && (
              <button onClick={onNavigate} className="btn-sm">
                →
              </button>
            )}
          </div>
        )}
      </td>
    </tr>

    {/* Expanded row */}
    {isExpanded && expandableContent && (
      <tr>
        <td colSpan={columns.length + 3} className="bg-gray-50 dark:bg-gray-900/10 p-4">
          {expandableContent}
        </td>
      </tr>
    )}
  </>
);
```

---

### 3. EditableWorkItemsTable (Work Items Specialization)

**File**: `components/editable-work-items-table.tsx`

**Purpose**: Work items-specific implementation of editable table with business logic.

**TypeScript Interface**:
```typescript
export interface EditableWorkItemsTableProps {
  parentWorkItemId: string;
  allowedChildTypes?: string[]; // From type relationships
  onNavigateToChild?: (childId: string) => void;
}
```

**Column Definitions**:
```typescript
const columns: EditableColumn<WorkItem>[] = [
  {
    key: 'checkbox',
    header: '',
    width: '40px',
    editable: false,
  },
  {
    key: 'work_item_type_name',
    header: 'Type',
    width: '150px',
    editable: true,
    required: true,
    render: (item) => (
      <span className="text-sm text-gray-700 dark:text-gray-300">
        {item.work_item_type_name}
      </span>
    ),
    renderEdit: (item, value, onChange, error) => (
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className={`form-select w-full ${error ? 'border-red-500' : ''}`}
      >
        <option value="">Select type...</option>
        {allowedChildTypes?.map(type => (
          <option key={type.id} value={type.id}>
            {type.name}
          </option>
        ))}
      </select>
    ),
    validate: (value) => {
      if (!value) return 'Type is required';
      return undefined;
    },
  },
  {
    key: 'subject',
    header: 'Subject',
    width: 'auto',
    editable: true,
    required: true,
    render: (item) => (
      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
        {item.subject || <span className="text-gray-400 italic">Untitled</span>}
      </span>
    ),
    renderEdit: (item, value, onChange, error) => (
      <input
        type="text"
        value={String(value || '')}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter subject..."
        className={`form-input w-full ${error ? 'border-red-500' : ''}`}
        autoFocus
      />
    ),
    validate: (value) => {
      if (!value || String(value).trim().length === 0) {
        return 'Subject is required';
      }
      if (String(value).length > 500) {
        return 'Subject must be 500 characters or less';
      }
      return undefined;
    },
  },
  {
    key: 'status_name',
    header: 'Status',
    width: '150px',
    editable: true,
    render: (item) => (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
        {item.status_name}
      </span>
    ),
    renderEdit: (item, value, onChange, error) => (
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className={`form-select w-full ${error ? 'border-red-500' : ''}`}
      >
        {statusesForType(item.work_item_type_id).map(status => (
          <option key={status.id} value={status.id}>
            {status.name}
          </option>
        ))}
      </select>
    ),
  },
  {
    key: 'priority',
    header: 'Priority',
    width: '120px',
    editable: true,
    render: (item) => (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
          item.priority === 'critical'
            ? 'text-red-700 bg-red-100 dark:bg-red-900/30'
            : item.priority === 'high'
              ? 'text-orange-700 bg-orange-100 dark:bg-orange-900/30'
              : item.priority === 'medium'
                ? 'text-yellow-700 bg-yellow-100 dark:bg-yellow-900/30'
                : 'text-green-700 bg-green-100 dark:bg-green-900/30'
        }`}
      >
        {item.priority}
      </span>
    ),
    renderEdit: (item, value, onChange, error) => (
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className={`form-select w-full ${error ? 'border-red-500' : ''}`}
      >
        <option value="critical">Critical</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
    ),
  },
  {
    key: 'assigned_to',
    header: 'Assignee',
    width: '180px',
    editable: true,
    render: (item) => (
      item.assigned_to_name ? (
        <span className="text-sm text-gray-700 dark:text-gray-300">
          {item.assigned_to_name}
        </span>
      ) : (
        <span className="text-sm text-gray-400 italic">Unassigned</span>
      )
    ),
    renderEdit: (item, value, onChange, error) => (
      <UserPicker
        value={String(value || '')}
        onChange={onChange}
        placeholder="Assign to..."
        error={error}
      />
    ),
  },
  {
    key: 'due_date',
    header: 'Due Date',
    width: '150px',
    editable: true,
    render: (item) => (
      item.due_date ? (
        <span className="text-sm text-gray-700 dark:text-gray-300">
          {new Date(item.due_date).toLocaleDateString()}
        </span>
      ) : (
        <span className="text-sm text-gray-400">—</span>
      )
    ),
    renderEdit: (item, value, onChange, error) => (
      <input
        type="date"
        value={String(value || '')}
        onChange={(e) => onChange(e.target.value)}
        className={`form-input w-full ${error ? 'border-red-500' : ''}`}
      />
    ),
  },
  {
    key: 'actions',
    header: '',
    width: '200px',
    editable: false,
  },
];
```

**Hooks Integration**:
```typescript
const EditableWorkItemsTable = ({ parentWorkItemId, allowedChildTypes, onNavigateToChild }: EditableWorkItemsTableProps) => {
  const router = useRouter();
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Fetch children
  const { data: children = [], isLoading, refetch } = useWorkItemChildren(parentWorkItemId);

  // Fetch allowed child types from relationships
  const { data: parentWorkItem } = useWorkItem(parentWorkItemId);
  const { data: typeRelationships } = useTypeRelationshipsForParent(parentWorkItem?.work_item_type_id);
  const { data: allTypes } = useActiveWorkItemTypes();

  const allowedTypes = allTypes?.filter(type =>
    typeRelationships?.some(rel => rel.child_type_id === type.id)
  );

  // Mutations
  const createWorkItem = useCreateWorkItem();
  const updateWorkItem = useUpdateWorkItem();
  const deleteWorkItem = useDeleteWorkItem();

  // Quick-add handler (stub creation)
  const handleQuickAdd = async () => {
    try {
      // Create stub work item
      await createWorkItem.mutateAsync({
        parent_work_item_id: parentWorkItemId,
        work_item_type_id: allowedTypes?.[0]?.id || '', // Default to first allowed type
        organization_id: parentWorkItem?.organization_id,
        subject: '', // Blank subject
        priority: 'medium',
        // All other fields undefined/null
      });

      // Refetch children to show new stub row
      refetch();

      // Show success toast
      setToastMessage('New row added');
      setShowToast(true);
    } catch (error) {
      // Handle error
      setToastMessage('Failed to add row');
      setShowToast(true);
    }
  };

  // Save handler
  const handleSave = async (item: WorkItem, changes: Partial<WorkItem>) => {
    await updateWorkItem.mutateAsync({
      id: item.id,
      ...changes,
    });

    refetch();
  };

  // Delete handler
  const handleDelete = async (item: WorkItem) => {
    await deleteWorkItem.mutateAsync(item.id);
    refetch();
  };

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <h3 className="text-lg font-semibold">Sub-Items</h3>
        <button
          onClick={handleQuickAdd}
          className="btn bg-indigo-500 hover:bg-indigo-600 text-white"
        >
          + Add Sub-Item
        </button>
      </div>

      <EditableDataTable
        title={`Child Work Items (${children.length})`}
        data={children}
        columns={columns}
        onSave={handleSave}
        onDelete={handleDelete}
        isLoading={isLoading}
        pagination={{ itemsPerPage: 50 }}
        expandable={{
          render: (item) => (
            <WorkItemExpandedRow workItem={item} />
          ),
        }}
        emptyState={{
          title: 'No child work items',
          description: 'Click "Add Sub-Item" to create a new child work item',
        }}
      />

      <Toast
        type="success"
        open={showToast}
        setOpen={setShowToast}
      >
        {toastMessage}
      </Toast>
    </div>
  );
};
```

---

### 4. WorkItemExpandedRow (Expandable Content)

**File**: `components/work-items/work-item-expanded-row.tsx`

**Purpose**: Displays description, custom fields, mini-comments/attachments in expanded row.

**TypeScript Interface**:
```typescript
export interface WorkItemExpandedRowProps {
  workItem: WorkItem;
}
```

**Content Sections**:
```typescript
const WorkItemExpandedRow = ({ workItem }: WorkItemExpandedRowProps) => {
  const { data: customFields } = useWorkItemFields(workItem.work_item_type_id);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left column: Description */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Description
        </h4>
        <div className="prose prose-sm dark:prose-invert">
          {workItem.description || <span className="text-gray-400 italic">No description</span>}
        </div>
      </div>

      {/* Right column: Custom Fields */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Custom Fields
        </h4>
        {customFields && customFields.length > 0 ? (
          <dl className="space-y-2">
            {customFields.map(field => (
              <div key={field.work_item_field_id}>
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {field.field_label}
                </dt>
                <dd className="text-sm text-gray-900 dark:text-gray-100">
                  {workItem.custom_fields?.[field.work_item_field_id] || '—'}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-gray-400 italic">No custom fields</p>
        )}
      </div>

      {/* Bottom: Mini comments/attachments preview */}
      <div className="lg:col-span-2">
        <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-400">
          <span>💬 {workItem.comment_count || 0} comments</span>
          <span>📎 {workItem.attachment_count || 0} attachments</span>
          <button
            onClick={() => router.push(`/work/${workItem.id}`)}
            className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
          >
            View full details →
          </button>
        </div>
      </div>
    </div>
  );
};
```

---

### 5. WorkItemHierarchyBreadcrumbs (Navigation Context)

**File**: `components/work-items/work-item-hierarchy-breadcrumbs.tsx`

**Purpose**: Show parent chain for hierarchy context when sidebar is hidden.

**TypeScript Interface**:
```typescript
export interface WorkItemHierarchyBreadcrumbsProps {
  workItemId: string;
}
```

**Implementation**:
```typescript
const WorkItemHierarchyBreadcrumbs = ({ workItemId }: WorkItemHierarchyBreadcrumbsProps) => {
  const { data: ancestors = [] } = useWorkItemAncestors(workItemId);
  const { data: currentItem } = useWorkItem(workItemId);

  if (ancestors.length === 0 && !currentItem) return null;

  const breadcrumbs = [...ancestors, currentItem].filter(Boolean);

  return (
    <nav className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
      </svg>

      {breadcrumbs.map((item, idx) => (
        <Fragment key={item.id}>
          {idx > 0 && (
            <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          )}
          {idx === breadcrumbs.length - 1 ? (
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {item.subject}
            </span>
          ) : (
            <Link
              href={`/work/${item.id}`}
              className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
              {item.subject}
            </Link>
          )}
        </Fragment>
      ))}
    </nav>
  );
};
```

---

## State Management

### Client-Side State (React Component State)

**EditableDataTable Component**:
```typescript
// Edit mode tracking
const [editingRows, setEditingRows] = useState<Set<string>>(new Set());

// Unsaved changes per row
const [unsavedChanges, setUnsavedChanges] = useState<Map<string, Partial<T>>>(new Map());

// Validation errors per row per field
const [validationErrors, setValidationErrors] = useState<Map<string, Record<string, string>>>(new Map());

// Expanded rows
const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

// Selected rows (for bulk actions)
const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

// Saving state (for loading indicators)
const [savingRows, setSavingRows] = useState<Set<string>>(new Set());
```

**State Flow Diagram**:
```
Initial State (Display Mode)
  ↓
User clicks "Edit" → Add to editingRows Set
  ↓
User changes field → Update unsavedChanges Map
  ↓
User clicks "Save"
  ↓
  ├─ Validate → If errors: Update validationErrors Map → Stay in edit mode
  └─ If valid: Add to savingRows Set → Call API
       ↓
       ├─ Success: Remove from editingRows, unsavedChanges, savingRows → Display mode
       └─ Error: Remove from savingRows → Stay in edit mode with error toast
```

### Server State (React Query)

**Existing Hooks** (from `lib/hooks/use-work-items.ts`):
```typescript
// Queries
useWorkItem(workItemId)           // Query key: ['work-item', workItemId]
useWorkItemChildren(parentId)     // Query key: ['work-item-children', parentId]
useWorkItemAncestors(workItemId)  // Query key: ['work-item-ancestors', workItemId]

// Mutations
useCreateWorkItem()               // Invalidates: ['work-item-children', parentId]
useUpdateWorkItem()               // Invalidates: ['work-item', id], ['work-item-children', parentId]
useDeleteWorkItem()               // Invalidates: ['work-item-children', parentId]
```

**Optimistic Updates Configuration**:
```typescript
const updateWorkItem = useUpdateWorkItem({
  onMutate: async (variables) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries(['work-item-children', parentId]);

    // Snapshot previous value
    const previousChildren = queryClient.getQueryData(['work-item-children', parentId]);

    // Optimistically update
    queryClient.setQueryData(['work-item-children', parentId], (old: WorkItem[]) => {
      return old.map(item =>
        item.id === variables.id ? { ...item, ...variables } : item
      );
    });

    // Return context with snapshot
    return { previousChildren };
  },
  onError: (err, variables, context) => {
    // Rollback to previous value
    if (context?.previousChildren) {
      queryClient.setQueryData(['work-item-children', parentId], context.previousChildren);
    }
  },
  onSettled: () => {
    // Refetch after error or success
    queryClient.invalidateQueries(['work-item-children', parentId]);
  },
});
```

---

## API Integration

### Existing Endpoints (No Changes Required)

All existing work items API endpoints support the inline editing workflow:

**1. Create Work Item (Stub Creation)**

```
POST /api/work-items
```

**Request Body** (minimal stub):
```json
{
  "parent_work_item_id": "uuid-of-parent",
  "work_item_type_id": "uuid-of-type",
  "organization_id": "uuid-of-org",
  "subject": "",
  "priority": "medium"
}
```

**Response**:
```json
{
  "work_item_id": "uuid-of-new-item",
  "subject": "",
  "status_id": "uuid-of-initial-status",
  "status_name": "Backlog",
  "priority": "medium",
  "parent_work_item_id": "uuid-of-parent",
  "depth": 1,
  "path": "/root-id/parent-id/new-id",
  ...
}
```

**Service Logic** (existing in `core-service.ts`):
- Validates parent exists
- Calculates hierarchy fields (depth, path, root_id)
- Sets initial status (where `is_initial: true`)
- Creates activity log entry
- Adds creator as watcher

---

**2. Update Work Item (Save Inline Changes)**

```
PUT /api/work-items/:id
```

**Request Body** (partial update):
```json
{
  "subject": "Updated subject",
  "status_id": "uuid-of-new-status",
  "priority": "high",
  "assigned_to": "uuid-of-user",
  "due_date": "2025-02-15"
}
```

**Response**: Full work item object with updated fields

**Service Logic** (existing):
- Validates status transition allowed
- Sends notifications if status/assignee changed
- Updates activity log with before/after values
- Auto-adds assignee as watcher

---

**3. Delete Work Item (Soft Delete)**

```
DELETE /api/work-items/:id
```

**Response**: Success message

**Service Logic** (existing):
- Sets `deleted_at` timestamp (soft delete)
- Creates activity log entry
- Filters deleted items from all queries (`WHERE deleted_at IS NULL`)

---

**4. Get Children (Table Data)**

```
GET /api/work-items/:parentId/children
```

**Query Params**: None required (pagination handled client-side)

**Response**: Array of work items (direct children only)

**Service Logic** (existing):
- Filters by `parent_work_item_id = parentId`
- Applies RBAC filtering
- Excludes soft-deleted items
- Returns with status name, type name, assignee name (joins)

---

### Validation Schemas

**Client-Side Validation** (inline, before save):
```typescript
// In EditableColumn definition
validate: (value, item) => {
  // Subject validation
  if (!value || String(value).trim().length === 0) {
    return 'Subject is required';
  }
  if (String(value).length > 500) {
    return 'Subject must be 500 characters or less';
  }
  return undefined;
}
```

**Server-Side Validation** (existing in `lib/validations/work-items.ts`):
```typescript
export const workItemUpdateSchema = z.object({
  subject: createSafeTextSchema(0, 500, 'Subject').optional(),
  description: createSafeTextSchema(0, 10000, 'Description').optional(),
  status_id: z.string().uuid().optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  assigned_to: z.string().uuid().optional().nullable(),
  due_date: z.string().optional().nullable(),
  custom_fields: z.record(z.unknown()).optional(),
});
```

---

## User Flows

### Flow 1: Rapid Stub Creation

**Scenario**: User needs to create 5 child work items quickly.

**Steps**:
1. User navigates to parent work item detail page
2. User clicks "Sub-items" tab
3. User sees editable table (empty state if no children)
4. User clicks "Add Sub-Item" button 5 times in rapid succession
5. **Backend**: Each click creates a stub work item in database
   - Parent set to current work item
   - Type = first allowed child type (or shows type picker modal)
   - Subject = blank
   - Status = initial status
   - Priority = medium
   - All other fields = null
6. **Frontend**: After each create, table refetches and shows new blank row in edit mode
7. User sees 5 blank rows, all in edit mode, ready to fill
8. User fills subject in row 1, tabs to status, tabs to priority, tabs to assignee
9. User presses Enter or clicks "Save" on row 1
10. Row 1 saves, exits edit mode, shows saved values
11. User repeats for rows 2-5
12. All 5 children created and saved

**Edge Cases**:
- If user clicks "Add Sub-Item" while offline → show error toast "Failed to create row"
- If user navigates away before saving → show warning modal "You have unsaved changes in 3 rows"
- If user clicks "Add Sub-Item" but type relationships require type selection → show type picker modal first

---

### Flow 2: Edit Existing Child

**Scenario**: User needs to update status and assignee on existing child work item.

**Steps**:
1. User sees existing child work items in table (display mode)
2. User clicks "Edit" button on row 3
3. Row 3 enters edit mode (blue left border, light background, inputs appear)
4. Subject cell becomes text input (pre-filled with current value)
5. Status cell becomes dropdown (pre-selected to current status)
6. Priority cell becomes dropdown
7. Assignee cell becomes user picker
8. Due date cell becomes date input
9. User changes status from "Backlog" to "In Progress"
10. User changes assignee from "Unassigned" to "John Doe"
11. Row 3 shows unsaved changes indicator (orange left border + asterisk)
12. User clicks "Save" button
13. **Frontend**: Shows "Saving..." loading state on button
14. **Backend**: Validates changes, updates work item, creates activity log, sends notification
15. **Frontend**: Optimistic update (row shows new values immediately)
16. **Frontend**: API returns success → row exits edit mode, blue border removed
17. Row 3 now displays new status badge and assignee in display mode

**Edge Cases**:
- If validation fails (e.g., subject blank) → show inline error below subject input, stay in edit mode
- If API call fails → revert optimistic update, show error toast, stay in edit mode
- If user clicks "Cancel" → discard changes, exit edit mode, revert to original values

---

### Flow 3: Multi-Row Editing

**Scenario**: User needs to edit 3 different children simultaneously.

**Steps**:
1. User sees 10 existing children in table
2. User clicks "Edit" on row 2 → row 2 enters edit mode
3. User clicks "Edit" on row 5 → row 5 enters edit mode (row 2 stays in edit mode)
4. User clicks "Edit" on row 8 → row 8 enters edit mode (rows 2, 5 stay in edit mode)
5. User sees 3 rows with blue left borders (edit mode)
6. User changes subject in row 2
7. User changes priority in row 5
8. User changes assignee in row 8
9. All 3 rows show unsaved changes (orange borders + asterisks)
10. User clicks "Save" on row 2 → row 2 saves, exits edit mode
11. Rows 5 and 8 remain in edit mode with unsaved changes
12. User clicks "Save" on row 5 → row 5 saves, exits edit mode
13. User clicks "Cancel" on row 8 → row 8 discards changes, exits edit mode

**Edge Cases**:
- If user has 3 rows in edit mode and clicks "Add Sub-Item" → new stub appears in edit mode (4 rows editing)
- If user has unsaved changes in 3 rows and closes browser tab → show browser's native "Leave site?" warning (via `beforeunload` event)

---

### Flow 4: Bulk Status Change

**Scenario**: User needs to change status of 5 children from "Backlog" to "In Progress".

**Steps**:
1. User sees 20 children in table (display mode)
2. User clicks checkboxes on rows 3, 5, 8, 12, 15 → 5 rows selected
3. Toolbar shows "5 selected" badge
4. Toolbar shows bulk action buttons
5. User clicks "Change Status" bulk action button
6. Dropdown appears with status options
7. User selects "In Progress"
8. Confirmation modal appears: "Change status for 5 items?"
9. User clicks "Confirm"
10. **Frontend**: Shows loading state on selected rows
11. **Backend**: Updates all 5 work items in parallel (batch of 5 concurrent requests per existing pattern)
12. **Frontend**: Optimistic update (all 5 rows show new status badge)
13. **Backend**: Returns success for all 5
14. **Frontend**: Refetches children to confirm updates
15. Selection cleared, rows return to normal display mode

**Edge Cases**:
- If 2 of 5 updates fail → show error toast "Failed to update 2 items", refetch to show correct state
- If user has row 3 in edit mode and tries to select row 3 for bulk action → checkbox disabled in edit mode
- If user has 5 rows selected and clicks "Delete" bulk action → show confirmation modal "Delete 5 items? This cannot be undone."

---

### Flow 5: Navigate to Child Detail

**Scenario**: User wants to see full details/comments/attachments for a child.

**Steps**:
1. User sees child work item in table
2. Option A: User clicks "→" navigate button in actions column
3. Option B: User expands row (chevron icon) → sees mini details → clicks "View full details →" link
4. Browser navigates to `/work/:childId`
5. User sees full work item detail page for child
6. User uses breadcrumbs to navigate back to parent

**Edge Cases**:
- If user is in edit mode on row 3 and clicks navigate → show warning "You have unsaved changes. Save or cancel before navigating."
- If user middle-clicks or Cmd+clicks navigate button → open in new tab (standard browser behavior)

---

## Visual Design Specifications

### Color Palette

**Row States**:
```css
/* Normal display mode */
.row-display {
  background: white;
  border-left: none;
}

/* Edit mode (active editing) */
.row-edit {
  background: rgb(239, 246, 255); /* blue-50 */
  border-left: 4px solid rgb(59, 130, 246); /* blue-500 */
}

/* Unsaved changes indicator */
.row-unsaved {
  border-left: 4px solid rgb(249, 115, 22); /* orange-500 */
}

/* Saving state */
.row-saving {
  opacity: 0.6;
  pointer-events: none;
}

/* Error state */
.row-error {
  border-left: 4px solid rgb(239, 68, 68); /* red-500 */
}

/* Expanded row background */
.row-expanded-content {
  background: rgb(249, 250, 251); /* gray-50 */
}
```

**Priority Badges**:
```css
.priority-critical {
  color: rgb(185, 28, 28); /* red-700 */
  background: rgb(254, 226, 226); /* red-100 */
}

.priority-high {
  color: rgb(194, 65, 12); /* orange-700 */
  background: rgb(255, 237, 213); /* orange-100 */
}

.priority-medium {
  color: rgb(161, 98, 7); /* yellow-700 */
  background: rgb(254, 249, 195); /* yellow-100 */
}

.priority-low {
  color: rgb(21, 128, 61); /* green-700 */
  background: rgb(220, 252, 231); /* green-100 */
}
```

**Status Badge** (default blue, customizable per status):
```css
.status-badge {
  color: rgb(29, 78, 216); /* blue-700 */
  background: rgb(219, 234, 254); /* blue-100 */
}
```

### Typography

**Table Text Sizes**:
- Table header: `text-xs font-semibold uppercase` (11px, 600 weight)
- Subject: `text-sm font-medium` (14px, 500 weight)
- Other cells: `text-sm` (14px, 400 weight)
- Validation errors: `text-xs text-red-600` (11px)
- Empty state: `text-gray-400 italic` (placeholder text)

### Spacing

**Table Cell Padding**:
```css
.table-cell {
  padding: 0.75rem 0.5rem; /* py-3 px-2 */
}

.table-cell:first-child {
  padding-left: 1.25rem; /* pl-5 */
}

.table-cell:last-child {
  padding-right: 1.25rem; /* pr-5 */
}
```

**Edit Mode Inputs**:
```css
.edit-input {
  padding: 0.5rem; /* py-2 px-2 */
  font-size: 0.875rem; /* text-sm */
  border-radius: 0.375rem; /* rounded-md */
}
```

**Expanded Row**:
```css
.expanded-row-content {
  padding: 1.5rem; /* p-6 */
  gap: 1.5rem; /* gap-6 for grid columns */
}
```

### Interactive States

**Button Styles**:
```css
/* Primary action (Save, Add Sub-Item) */
.btn-primary {
  background: rgb(79, 70, 229); /* indigo-600 */
  color: white;
}
.btn-primary:hover {
  background: rgb(67, 56, 202); /* indigo-700 */
}

/* Secondary action (Cancel, Edit) */
.btn-secondary {
  background: rgb(243, 244, 246); /* gray-100 */
  color: rgb(55, 65, 81); /* gray-700 */
  border: 1px solid rgb(209, 213, 219); /* gray-300 */
}
.btn-secondary:hover {
  background: rgb(229, 231, 235); /* gray-200 */
}

/* Danger action (Delete) */
.btn-danger {
  color: rgb(220, 38, 38); /* red-600 */
}
.btn-danger:hover {
  background: rgb(254, 226, 226); /* red-100 */
}
```

**Focus States**:
```css
.edit-input:focus {
  outline: 2px solid rgb(99, 102, 241); /* indigo-500 */
  outline-offset: -1px;
}
```

### Loading States

**Skeleton Loader** (while fetching children):
```tsx
<tr>
  <td className="px-2 first:pl-5 last:pr-5 py-3">
    <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
  </td>
  <td className="px-2 py-3">
    <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
  </td>
  <td className="px-2 py-3">
    <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
  </td>
  {/* ...more cells */}
</tr>
```

**Saving Indicator**:
```tsx
<button disabled className="btn-primary opacity-60">
  <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
  Saving...
</button>
```

---

## Implementation Plan

### Phase 1: Core Generic Components (Tasks 1-13)

**Goal**: Build reusable `EditableDataTable` and `EditableTableRow` components.

#### Task 1: Create base EditableDataTable component structure with TypeScript types
**File**: `components/editable-data-table.tsx`
**Deliverables**:
- [ ] Create file with component skeleton
- [ ] Define `EditableColumn<T>` interface with `render` and `renderEdit` functions
- [ ] Define `EditableDataTableProps<T>` interface
- [ ] Export component with basic table structure (header + body)
- [ ] Add TypeScript generic constraint: `T extends { id: string }`

**Acceptance Criteria**:
- Component renders without errors
- TypeScript has no type errors (`pnpm tsc`)
- Passes linting (`pnpm lint`)

---

#### Task 2: Implement row edit mode toggle and state management
**File**: `components/editable-data-table.tsx`
**Deliverables**:
- [ ] Add state: `editingRows: Set<string>`
- [ ] Add state: `unsavedChanges: Map<string, Partial<T>>`
- [ ] Add state: `validationErrors: Map<string, Record<string, string>>`
- [ ] Implement `enterEditMode(rowId)` function
- [ ] Implement `exitEditMode(rowId)` function
- [ ] Pass edit state to child row components

**Acceptance Criteria**:
- Clicking "Edit" button toggles row into edit mode
- State properly tracks which rows are editing
- No memory leaks (cleanup on unmount)

---

#### Task 3: Build EditableTableRow component with display and edit modes
**File**: `components/editable-table-row.tsx`
**Deliverables**:
- [ ] Create new file with `EditableTableRow` component
- [ ] Define `EditableTableRowProps<T>` interface
- [ ] Implement display mode rendering (uses column.render)
- [ ] Implement edit mode rendering (uses column.renderEdit)
- [ ] Add visual state classes (blue border for edit, orange for unsaved)
- [ ] Render actions column with Edit/Save/Cancel/Delete buttons

**Acceptance Criteria**:
- Row renders correctly in both display and edit modes
- Visual states (borders, backgrounds) match design specs
- Buttons appear in correct states

---

#### Task 4: Add inline form inputs for each cell type
**File**: `components/editable-table-row.tsx`
**Deliverables**:
- [ ] Create text input renderer with value binding
- [ ] Create dropdown/select renderer with options
- [ ] Create date input renderer
- [ ] Create user picker renderer (integrate existing UserPicker component)
- [ ] Add onChange handlers that update parent state
- [ ] Add error prop to input renderers (red border when error)

**Acceptance Criteria**:
- All input types render correctly
- Typing in inputs updates component state
- Error states display red borders
- UserPicker integration works

---

#### Task 5: Implement save/cancel/delete row actions with visual states
**File**: `components/editable-data-table.tsx` and `components/editable-table-row.tsx`
**Deliverables**:
- [ ] Add `savingRows: Set<string>` state
- [ ] Implement `handleSave(rowId)` function with validation
- [ ] Implement `handleCancel(rowId)` function (discard changes)
- [ ] Implement `handleDelete(rowId)` function with confirmation
- [ ] Add loading state to Save button when saving
- [ ] Disable inputs when saving

**Acceptance Criteria**:
- Save validates fields, shows errors if invalid
- Save calls `onSave` prop callback with changes
- Cancel discards changes and exits edit mode
- Delete shows confirmation modal and calls `onDelete` callback
- Loading states display correctly

---

#### Task 6: Add inline validation and error display in cells
**File**: `components/editable-table-row.tsx`
**Deliverables**:
- [ ] Add `validateRow()` function that runs all column validators
- [ ] Display inline errors below each input field
- [ ] Add red border to inputs with errors
- [ ] Prevent save if validation fails
- [ ] Clear errors when user corrects input

**Acceptance Criteria**:
- Required field validation works (e.g., subject required)
- Max length validation works (e.g., subject ≤ 500 chars)
- Custom validators from column definitions execute
- Errors display in red text below inputs
- Save button disabled when errors exist (optional, or just prevent save on click)

---

#### Task 7: Implement unsaved changes tracking with visual indicators
**File**: `components/editable-data-table.tsx`
**Deliverables**:
- [ ] Track unsaved changes in `unsavedChanges` Map
- [ ] Add orange left border when row has unsaved changes
- [ ] Add asterisk (*) to subject or row indicator
- [ ] Implement `hasUnsavedChanges(rowId)` helper function
- [ ] Clear unsaved state on successful save

**Acceptance Criteria**:
- Orange border appears when field value changes
- Orange border persists until save or cancel
- Visual indicator is clear and noticeable

---

#### Task 8: Add keyboard navigation support
**File**: `components/editable-data-table.tsx` and `components/editable-table-row.tsx`
**Deliverables**:
- [ ] Add `handleKeyDown` event handler to edit mode inputs
- [ ] Implement Enter key → save row (Ctrl+Enter or just Enter in last field)
- [ ] Implement Escape key → cancel edit
- [ ] Implement Tab key → move to next field (browser default)
- [ ] Add focus management (focus first input when entering edit mode)

**Acceptance Criteria**:
- Pressing Enter in edit mode saves the row
- Pressing Escape in edit mode cancels and exits edit mode
- Tab key moves between fields naturally
- Focus moves to first input when edit mode activated

---

#### Task 9: Create quick-add row functionality for rapid stub creation
**File**: `components/editable-data-table.tsx`
**Deliverables**:
- [ ] Add "Add Row" button to table toolbar
- [ ] Implement `handleQuickAdd()` callback prop
- [ ] Show loading state on "Add Row" button during creation
- [ ] Refetch data after stub created (or optimistic insert)
- [ ] Auto-focus new row in edit mode after creation

**Acceptance Criteria**:
- Clicking "Add Row" calls `onQuickAdd` callback
- New row appears in table after successful creation
- New row is automatically in edit mode
- User can click "Add Row" multiple times rapidly

---

#### Task 10: Build expandable row feature for additional details
**File**: `components/editable-data-table.tsx` and `components/editable-table-row.tsx`
**Deliverables**:
- [ ] Add `expandedRows: Set<string>` state
- [ ] Add expand/collapse toggle button (chevron icon)
- [ ] Render expanded content in separate `<tr>` below main row
- [ ] Add expand column to table (leftmost)
- [ ] Style expanded content area (gray background, padding)

**Acceptance Criteria**:
- Clicking chevron toggles row expansion
- Chevron icon rotates 90° when expanded
- Expanded content renders correctly
- Multiple rows can be expanded simultaneously

---

#### Task 11: Add multi-row edit mode support
**File**: `components/editable-data-table.tsx`
**Deliverables**:
- [ ] Allow multiple row IDs in `editingRows` Set
- [ ] Test editing 3 rows simultaneously
- [ ] Ensure each row maintains independent state
- [ ] Ensure saving one row doesn't affect others
- [ ] Add prop `allowMultiEdit` (default: true)

**Acceptance Criteria**:
- User can click "Edit" on row 1, then "Edit" on row 3 → both in edit mode
- Each row has independent unsaved changes
- Saving row 1 doesn't exit edit mode on row 3
- If `allowMultiEdit: false`, entering edit on new row auto-saves previous row

---

#### Task 12: Implement optimistic UI updates during save operations
**File**: `components/editable-work-items-table.tsx` (later task, but prepare hooks)
**Deliverables**:
- [ ] Configure React Query mutations with optimistic updates
- [ ] On save, immediately update table data optimistically
- [ ] On error, revert optimistic update and show error toast
- [ ] On success, refetch to confirm server state

**Acceptance Criteria**:
- Clicking "Save" immediately shows new values in display mode
- If API fails, row reverts to previous values
- No flickering or UI jumps during optimistic updates

---

#### Task 13: Add loading states and skeleton screens for async operations
**File**: `components/editable-data-table.tsx`
**Deliverables**:
- [ ] Add `isLoading` prop to component
- [ ] Render skeleton rows when `isLoading: true`
- [ ] Add skeleton animation (pulse effect)
- [ ] Show 5 skeleton rows by default
- [ ] Hide skeleton when data loaded

**Acceptance Criteria**:
- Skeleton appears while fetching data
- Skeleton matches table structure (same column count)
- Smooth transition from skeleton to real data

---

### Phase 2: Work Items Specialization (Tasks 14-18)

**Goal**: Create work items-specific table with business logic.

#### Task 14: Create EditableWorkItemsTable specialized component
**File**: `components/editable-work-items-table.tsx`
**Deliverables**:
- [ ] Create new file with component
- [ ] Define `EditableWorkItemsTableProps` interface
- [ ] Import and use `EditableDataTable` generic component
- [ ] Add toolbar with "Add Sub-Item" button
- [ ] Add title and count display

**Acceptance Criteria**:
- Component renders editable table
- Props interface includes `parentWorkItemId`
- Component structure is clean and readable

---

#### Task 15: Define work item column configuration
**File**: `components/editable-work-items-table.tsx`
**Deliverables**:
- [ ] Define columns array with 7 columns: Checkbox, Type, Subject, Status, Priority, Assignee, Due Date, Actions
- [ ] Implement `render` functions for display mode (badges, text, user name)
- [ ] Implement `renderEdit` functions for edit mode (inputs, dropdowns, pickers)
- [ ] Add `validate` functions for required fields
- [ ] Set column widths (Type: 150px, Subject: auto, Status: 150px, etc.)

**Acceptance Criteria**:
- All columns render correctly in display mode
- All columns render form inputs in edit mode
- Column widths are reasonable
- Priority badges show correct colors
- Status badges render correctly

---

#### Task 16: Integrate work item hooks
**File**: `components/editable-work-items-table.tsx`
**Deliverables**:
- [ ] Import hooks: `useWorkItemChildren`, `useCreateWorkItem`, `useUpdateWorkItem`, `useDeleteWorkItem`
- [ ] Fetch children with `useWorkItemChildren(parentWorkItemId)`
- [ ] Implement `handleSave` using `updateWorkItem.mutateAsync`
- [ ] Implement `handleDelete` using `deleteWorkItem.mutateAsync`
- [ ] Add refetch after mutations
- [ ] Add error handling with toast notifications

**Acceptance Criteria**:
- Table data fetches from API correctly
- Save mutations work and update backend
- Delete mutations work and remove rows
- Errors display user-friendly toast messages
- React Query cache invalidation works

---

#### Task 17: Implement type relationship filtering for allowed child types
**File**: `components/editable-work-items-table.tsx`
**Deliverables**:
- [ ] Fetch parent work item with `useWorkItem(parentWorkItemId)`
- [ ] Fetch type relationships with `useTypeRelationshipsForParent(parentTypeId)`
- [ ] Fetch all work item types with `useActiveWorkItemTypes()`
- [ ] Filter types to only allowed children
- [ ] Pass filtered types to Type column dropdown

**Acceptance Criteria**:
- Type dropdown shows only allowed child types
- If no relationships configured, show all types
- Type dropdown is required (validation error if blank)

---

#### Task 18: Add stub work item creation API call on quick-add button click
**File**: `components/editable-work-items-table.tsx`
**Deliverables**:
- [ ] Implement `handleQuickAdd` function
- [ ] Call `createWorkItem.mutateAsync` with minimal stub data
- [ ] Set parent_work_item_id to current parent
- [ ] Set work_item_type_id to first allowed type (or show type picker modal)
- [ ] Set subject to blank ""
- [ ] Set priority to "medium"
- [ ] Refetch children after creation
- [ ] Show success/error toast

**Acceptance Criteria**:
- Clicking "Add Sub-Item" creates blank work item in database
- New row appears in table immediately
- New row is in edit mode with subject focused
- User can click button multiple times rapidly
- Each click creates a separate stub

---

### Phase 3: Sub-Items Tab Integration (Tasks 19-23)

**Goal**: Replace existing card-based UI with new editable table.

#### Task 19: Replace card-based sub-items display with EditableWorkItemsTable
**File**: `app/(default)/work/[id]/work-item-detail-content.tsx`
**Deliverables**:
- [ ] Import `EditableWorkItemsTable` component
- [ ] Replace lines 344-420 (card-based children display) with `<EditableWorkItemsTable parentWorkItemId={workItemId} />`
- [ ] Remove old card rendering code
- [ ] Remove "Add Sub-Item" button (now in table toolbar)
- [ ] Test that sub-items tab renders table correctly

**Acceptance Criteria**:
- Sub-items tab shows editable table
- Existing children load and display
- No console errors or warnings
- Navigation to child detail still works (via table actions)

---

#### Task 20: Implement conditional sidebar hiding when sub-items tab is active
**File**: `app/(default)/work/[id]/work-item-detail-content.tsx`
**Deliverables**:
- [ ] Check current `activeTab` state
- [ ] Conditionally render sidebar only when `activeTab !== 'sub-items'`
- [ ] Adjust grid layout: 2-column when sidebar visible, 1-column when hidden
- [ ] Add className: `lg:grid-cols-1` when sub-items tab active, `lg:grid-cols-3` otherwise

**Acceptance Criteria**:
- Sidebar hidden when sub-items tab active
- Sidebar visible on all other tabs (Details, Comments, Activity, Watchers)
- Table takes full width when sidebar hidden
- Responsive layout works on mobile

---

#### Task 21: Add hierarchy breadcrumbs to sub-items tab for navigation context
**File**: `components/work-items/work-item-hierarchy-breadcrumbs.tsx` and `app/(default)/work/[id]/work-item-detail-content.tsx`
**Deliverables**:
- [ ] Create `WorkItemHierarchyBreadcrumbs` component
- [ ] Use `useWorkItemAncestors(workItemId)` hook
- [ ] Render breadcrumb trail with links
- [ ] Show home icon → ancestor 1 → ancestor 2 → current (bold)
- [ ] Import and render breadcrumbs above table in sub-items tab

**Acceptance Criteria**:
- Breadcrumbs display correct hierarchy chain
- Clicking ancestor links navigates to that work item
- Current work item shown in bold (not clickable)
- Breadcrumbs are compact and horizontally scrollable if needed

---

#### Task 22: Add pagination with 50 items per page to editable table
**File**: `components/editable-data-table.tsx`
**Deliverables**:
- [ ] Import existing `usePagination` hook
- [ ] Add pagination controls above and below table
- [ ] Set default items per page to 50
- [ ] Slice data to show only current page items
- [ ] Add page navigation buttons (Previous, Next, page numbers)

**Acceptance Criteria**:
- Table shows 50 items per page by default
- Pagination controls render above and below table
- User can navigate between pages
- Page numbers display correctly
- If total items ≤ 50, pagination hidden

---

#### Task 23: Implement navigation warning for unsaved changes
**File**: `components/editable-work-items-table.tsx` or `components/editable-data-table.tsx`
**Deliverables**:
- [ ] Add `useEffect` with `beforeunload` event listener
- [ ] Check if any rows have unsaved changes
- [ ] Show browser warning: "You have unsaved changes. Leave anyway?"
- [ ] Add cleanup to remove event listener on unmount
- [ ] Add warning when clicking tab navigation with unsaved changes

**Acceptance Criteria**:
- Browser shows warning when user tries to close tab with unsaved changes
- Browser shows warning when user tries to navigate to different URL
- No warning shown if all changes saved
- Warning is clear and user-friendly

---

### Phase 4: Quality & Testing (Tasks 24-25)

**Goal**: Ensure code quality and fix any issues.

#### Task 24: Run type checking (pnpm tsc) and fix any errors
**Deliverables**:
- [ ] Run `pnpm tsc` in project root
- [ ] Fix all TypeScript errors in new components
- [ ] Fix any TypeScript errors in modified files
- [ ] Ensure strict mode compliance (no `any` types, proper null checks)

**Acceptance Criteria**:
- `pnpm tsc` completes with 0 errors
- All types are properly defined
- No `any` types used (strict mode)

---

#### Task 25: Run linting (pnpm lint) and fix any errors
**Deliverables**:
- [ ] Run `pnpm lint` in project root
- [ ] Fix all Biome linting errors
- [ ] Fix custom logger lint errors (no server logger in client files)
- [ ] Format code with `pnpm format`

**Acceptance Criteria**:
- `pnpm lint` completes with 0 errors
- `pnpm lint:biome` passes
- `pnpm lint:logger` passes
- Code formatting is consistent

---

## Testing Strategy

### Unit Tests

**Test Files**:
```
components/__tests__/editable-data-table.test.tsx
components/__tests__/editable-table-row.test.tsx
components/__tests__/editable-work-items-table.test.tsx
```

**Test Cases**:
```typescript
describe('EditableDataTable', () => {
  it('renders table with data in display mode', () => {});
  it('enters edit mode when edit button clicked', () => {});
  it('exits edit mode when save button clicked', () => {});
  it('discards changes when cancel button clicked', () => {});
  it('shows validation errors for invalid fields', () => {});
  it('prevents save when validation fails', () => {});
  it('tracks unsaved changes with visual indicator', () => {});
  it('supports multi-row editing', () => {});
  it('expands row when chevron clicked', () => {});
  it('collapses row when chevron clicked again', () => {});
  it('handles keyboard navigation (Enter, Escape, Tab)', () => {});
  it('shows loading skeleton when isLoading true', () => {});
  it('calls onSave callback with correct data', () => {});
  it('calls onDelete callback when delete confirmed', () => {});
});

describe('EditableWorkItemsTable', () => {
  it('fetches children from API', () => {});
  it('creates stub work item on quick-add', () => {});
  it('filters types based on parent relationships', () => {});
  it('updates work item on save', () => {});
  it('soft-deletes work item on delete', () => {});
  it('shows toast on error', () => {});
  it('performs optimistic updates', () => {});
  it('reverts optimistic updates on error', () => {});
});
```

### Integration Tests

**Test Scenarios**:
1. **Full CRUD workflow**: Create stub → edit fields → save → verify in database
2. **Multi-row editing**: Edit 3 rows simultaneously → save all → verify
3. **Type relationships**: Only allowed child types appear in dropdown
4. **Pagination**: Create 75 children → verify pagination shows 2 pages
5. **Validation**: Try to save with blank subject → see error → fix → save succeeds

### Manual Testing Checklist

**Before Merge**:
- [ ] Create 5 stub work items rapidly (quick-add stress test)
- [ ] Edit multiple rows simultaneously (multi-edit test)
- [ ] Validate required fields (leave subject blank, try to save)
- [ ] Test keyboard navigation (Tab, Enter, Escape)
- [ ] Test expandable rows (expand 3 rows, verify content)
- [ ] Test bulk actions (select 5 rows, change status)
- [ ] Test navigation warning (edit row, try to navigate away)
- [ ] Test pagination (create 60 children, verify pages)
- [ ] Test mobile responsive (check on small screen)
- [ ] Test dark mode (toggle dark mode, verify styling)
- [ ] Test error handling (disconnect network, try to save)
- [ ] Test optimistic updates (slow network, verify instant feedback)

---

## Future Enhancements

### Phase 5: Advanced Features (Post-MVP)

**Auto-Save Mode**:
- [ ] Add `autoSave` prop to enable auto-save after debounce
- [ ] Save changes automatically 2 seconds after user stops typing
- [ ] Show "Saving..." indicator next to field
- [ ] Show "Saved ✓" indicator when complete

**Drag-to-Reorder**:
- [ ] Add drag handle column
- [ ] Integrate drag-and-drop library (e.g., dnd-kit)
- [ ] Update `display_order` field on drop
- [ ] Persist order to database

**Inline Filtering**:
- [ ] Add filter dropdowns in table header
- [ ] Filter by status, priority, assignee, type
- [ ] Combine with search functionality
- [ ] Show "X filters active" badge

**Column Sorting**:
- [ ] Add sort icons to column headers
- [ ] Sort by subject (alphabetical), due date (chronological), priority (critical → low)
- [ ] Maintain sort state in URL query params

**Batch Import**:
- [ ] Add "Import CSV" button
- [ ] Parse CSV with subject, status, priority, assignee columns
- [ ] Create multiple work items from CSV rows
- [ ] Show preview before confirming import

**Undo/Redo**:
- [ ] Track state history per row
- [ ] Add Undo button (Ctrl+Z) to revert last change
- [ ] Add Redo button (Ctrl+Shift+Z) to reapply change
- [ ] Show undo/redo buttons in toolbar

**Custom Field Inline Editing**:
- [ ] Add custom field columns to table (configurable)
- [ ] Render custom field inputs in edit mode
- [ ] Support all field types (text, number, date, dropdown, checkbox, user picker)
- [ ] Handle conditional visibility rules

**Concurrent Edit Detection**:
- [ ] Check `updated_at` timestamp before saving
- [ ] If row was updated by another user, show conflict modal
- [ ] Allow user to choose: overwrite, cancel, or merge changes
- [ ] Implement optimistic locking

---

## Appendix

### Data Model Reference

**Work Item Schema** (relevant fields):
```typescript
{
  work_item_id: string; // UUID
  work_item_type_id: string;
  work_item_type_name: string; // Joined
  organization_id: string;
  subject: string;
  description: string;
  status_id: string;
  status_name: string; // Joined
  status_category: 'backlog' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'critical' | 'high' | 'medium' | 'low';
  assigned_to: string | null;
  assigned_to_name: string | null; // Joined
  due_date: string | null; // ISO date
  parent_work_item_id: string | null;
  root_work_item_id: string | null;
  depth: number;
  path: string; // '/root-id/parent-id/this-id'
  created_by: string;
  created_by_name: string; // Joined
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  custom_fields: Record<string, unknown>;
}
```

### Permission Matrix

| Action | Permission | Scope |
|--------|-----------|-------|
| View children | `work-items:read:all` | All work items |
| View children | `work-items:read:organization` | Same organization |
| View children | `work-items:read:own` | Created by self |
| Create child | `work-items:create:all` | Any organization |
| Create child | `work-items:create:organization` | Same organization |
| Create child | `work-items:create:own` | Self as creator |
| Update child | `work-items:update:all` | Any work item |
| Update child | `work-items:update:organization` | Same organization |
| Update child | `work-items:update:own` | Created by self |
| Delete child | `work-items:delete:all` | Any work item |
| Delete child | `work-items:delete:organization` | Same organization |
| Delete child | `work-items:delete:own` | Created by self |

### API Rate Limits

All work items API routes use the `api` rate limit tier:
- **Limit**: 100 requests per minute per user
- **Behavior**: 429 error if exceeded
- **Recovery**: Retry after 1 minute

For rapid stub creation (clicking "Add Sub-Item" 10 times), this is well within the limit.

### Browser Compatibility

**Target Browsers**:
- Chrome 90+ ✅
- Firefox 88+ ✅
- Safari 14+ ✅
- Edge 90+ ✅

**Features Used**:
- CSS Grid (IE11 not supported, acceptable)
- Flexbox (fully supported)
- ES6+ JavaScript (transpiled by Next.js)
- React 19 (latest features)

---

## Success Metrics

### User Experience Metrics

**Time to Create 5 Children**:
- **Before**: ~2 minutes (8-10 clicks × 5 = 40-50 clicks, form filling × 5)
- **After**: ~30 seconds (5 clicks + rapid typing)
- **Target**: <1 minute for 5 children

**Clicks to Edit Child**:
- **Before**: 3 clicks (click card, scroll, click edit button in modal)
- **After**: 1 click (click edit button in row)
- **Target**: ≤2 clicks

**Bulk Status Change**:
- **Before**: Navigate to each child individually (5 children = 15 clicks + navigation)
- **After**: 3 clicks (select rows, click bulk action, confirm)
- **Target**: ≤5 clicks for any bulk operation

### Technical Metrics

**Page Load Time**: <2 seconds for 50 children
**Save Operation**: <500ms for single update
**Bulk Operation**: <3 seconds for 5 concurrent updates
**TypeScript Coverage**: 100% (no `any` types)
**Test Coverage**: ≥80% for new components

---

## Approval & Sign-Off

**Reviewed By**: _________________
**Approved By**: _________________
**Date**: _________________

---

## Changelog

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-01-26 | Initial specification | Claude Code |

---

**End of Document**
