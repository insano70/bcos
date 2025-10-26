# Native Browser Confirmation Dialog Audit

**Date**: October 26, 2025  
**Purpose**: Replace all ugly native `confirm()` dialogs with custom modals matching UI design

---

## Executive Summary

Found **6 locations** using native `window.confirm()` dialogs that should be replaced with our custom `DeleteConfirmationModal` component.

**Priority Breakdown**:
- 🔴 **HIGH** (2): Generic data table components (affects users, practices, orgs, data sources, work items)
- 🟡 **MEDIUM** (4): Specific modals (statuses, transitions, fields, unsaved changes)

---

## Analysis by Location

### 🔴 **HIGH PRIORITY: Generic Table Components**

These affect MULTIPLE pages because they're reusable components.

#### **1. DataTableDropdown Component** 🔴 CRITICAL
**File**: `components/data-table-dropdown.tsx` (line 42)  
**Usage**: Used by Users, Practices, Organizations, Data Sources pages  
**Current Code**:
```typescript
const handleAction = async (action: DataTableDropdownAction<T>) => {
  const confirmMessage =
    typeof action.confirm === 'function' ? action.confirm(item) : action.confirm;

  if (confirmMessage && !confirm(confirmMessage)) {  // ❌ Native confirm
    return;
  }

  setIsProcessing(true);
  try {
    await action.onClick(item);
    setIsOpen(false);
  } catch (error) {
    console.error('Action failed:', error);
  } finally {
    setIsProcessing(false);
  }
};
```

**Affects These Pages**:
- ✅ Users page (`/configure/users`) - Delete user, Activate/Deactivate user
- ✅ Practices page (`/configure/practices`) - Edit, Preview, Copy domain
- ✅ Organizations page (`/configure/organizations`) - Edit, Delete
- ✅ Data Sources page (`/configure/data-sources`) - Edit, Delete
- ✅ Work Items page (`/work`) - Edit, Delete (probably)

**Example Confirm Messages**:
```typescript
// From users-content.tsx line 306-307
confirm: (u) => `Are you sure you want to delete ${u.first_name} ${u.last_name}? This action cannot be undone.`

// From users-content.tsx line 292-295
confirm: (u) => u.is_active
  ? `Are you sure you want to inactivate ${u.first_name} ${u.last_name}? They will no longer be able to access the system.`
  : `Are you sure you want to activate ${u.first_name} ${u.last_name}?`
```

---

#### **2. DataTableStandard Component** 🔴 CRITICAL
**File**: `components/data-table-standard.tsx` (line 273)  
**Usage**: Bulk actions (select multiple items, delete all)  
**Current Code**:
```typescript
<button
  onClick={() => {
    if (action.confirm && !confirm(action.confirm)) return;  // ❌ Native confirm
    action.onClick(selectedItemsData);
  }}
>
  {action.label}
</button>
```

**Affects These Pages**:
- Bulk delete users
- Bulk delete practices
- Bulk delete organizations
- Bulk delete data sources
- Bulk delete work items

**Example Bulk Actions**:
```typescript
// Bulk delete with native confirm
{
  label: 'Delete Selected',
  variant: 'danger',
  confirm: 'Are you sure you want to delete the selected items?',
  onClick: handleBulkDelete,
}
```

---

### 🟡 **MEDIUM PRIORITY: Specific Modals**

These are in specific modals/dialogs, less critical but still need fixing.

#### **3. Manage Statuses Modal**
**File**: `components/manage-statuses-modal.tsx` (line 138)  
**Current Code**:
```typescript
const handleDeleteStatus = async (status: WorkItemStatus) => {
  if (!confirm(`Are you sure you want to delete "${status.status_name}"?`)) {  // ❌ Native
    return;
  }

  try {
    await deleteStatus.mutateAsync({
      workItemTypeId: workItemTypeId,
      statusId: status.work_item_status_id,
    });
  } catch (error) {
    console.error('Failed to delete status:', error);
  }
};
```

**Usage**: Deleting work item statuses (e.g., "To Do", "In Progress")

---

#### **4. Workflow Visualization Modal**
**File**: `components/workflow-visualization-modal.tsx` (line 91)  
**Current Code**:
```typescript
const handleDeleteTransition = async (transition: WorkItemStatusTransition) => {
  if (!confirm('Are you sure you want to delete this transition rule?')) {  // ❌ Native
    return;
  }

  try {
    await deleteTransition.mutateAsync({
      workItemTypeId: workItemTypeId,
      transitionId: transition.work_item_status_transition_id,
    });
  } catch (error) {
    console.error('Failed to delete transition:', error);
  }
};
```

**Usage**: Deleting status transition rules in workflow

---

#### **5. Manage Work Item Fields Modal**
**File**: `components/manage-work-item-fields-modal.tsx` (line 39)  
**Current Code**:
```typescript
const handleDeleteField = useCallback(
  async (fieldId: string) => {
    if (confirm('Are you sure you want to delete this field? This action cannot be undone.')) {  // ❌ Native
      try {
        await deleteField.mutateAsync(fieldId);
        refetch();
      } catch (error) {
        console.error('Failed to delete field:', error);
      }
    }
  },
  [deleteField, refetch]
);
```

**Usage**: Deleting custom fields from work item types

---

#### **6. Edit Transition Config Modal**
**File**: `components/edit-transition-config-modal.tsx` (line 74)  
**Current Code**:
```typescript
const handleCancel = () => {
  if (hasChanges && !confirm('You have unsaved changes. Are you sure you want to close?')) {  // ❌ Native
    return;
  }
  setValidationConfig(parseValidationConfigSafe(transition.validation_config));
  setActionConfig(parseActionConfigSafe(transition.action_config));
  setHasChanges(false);
  setIsOpen(false);
};
```

**Usage**: Warning about unsaved changes when closing modal

---

## Recommendations

### **Strategy 1: Generic Solution for Data Tables** ⭐ RECOMMENDED

**Challenge**: Data table components are generic and used by many pages. We can't hardcode specific modals.

**Solution**: Add modal callback support to DataTable components

```typescript
// Enhanced DataTableDropdownAction interface
export interface DataTableDropdownAction<T> {
  label: string | ((item: T) => string);
  icon?: ReactNode;
  onClick: (item: T) => Promise<void> | void;
  variant?: 'default' | 'danger';
  show?: (item: T) => boolean;
  
  // OLD (deprecated):
  confirm?: string | ((item: T) => string);  // ❌ Uses native confirm
  
  // NEW (recommended):
  confirmModal?: {
    title: string | ((item: T) => string);
    message: string | ((item: T) => string);
    confirmText?: string;
  };
}
```

**Implementation**:
```typescript
// In data-table-dropdown.tsx
const [confirmModalOpen, setConfirmModalOpen] = useState(false);
const [pendingAction, setPendingAction] = useState<DataTableDropdownAction<T> | null>(null);

const handleActionClick = (action: DataTableDropdownAction<T>) => {
  if (action.confirmModal) {
    // Use custom modal
    setPendingAction(action);
    setConfirmModalOpen(true);
  } else if (action.confirm) {
    // Fallback to native (deprecated)
    if (!confirm(...)) return;
    handleAction(action);
  } else {
    // No confirmation needed
    handleAction(action);
  }
};

// Render modal
{pendingAction && (
  <DeleteConfirmationModal
    isOpen={confirmModalOpen}
    setIsOpen={setConfirmModalOpen}
    title={/* resolve from pendingAction.confirmModal.title */}
    itemName={/* item name */}
    message={/* resolve from pendingAction.confirmModal.message */}
    onConfirm={async () => await pendingAction.onClick(item)}
  />
)}
```

**Benefits**:
- ✅ Works for all pages using DataTable
- ✅ Backward compatible (old `confirm` still works)
- ✅ Each page can customize modal text
- ✅ Single modal per dropdown (not per action)

---

### **Strategy 2: Specific Modals for Each Use Case**

For the 4 specific modals (#3-6), replace each `confirm()` with proper modal:

```typescript
// Before (manage-statuses-modal.tsx)
if (!confirm(`Are you sure you want to delete "${status.status_name}"?`)) {
  return;
}

// After
const [deleteModalOpen, setDeleteModalOpen] = useState(false);
const [selectedStatus, setSelectedStatus] = useState<WorkItemStatus | null>(null);

<DeleteConfirmationModal
  isOpen={deleteModalOpen}
  setIsOpen={setDeleteModalOpen}
  title="Delete Status"
  itemName={selectedStatus?.status_name || ''}
  onConfirm={handleConfirmDelete}
/>
```

---

## Implementation Plan

### **Phase 1: Enhance Generic Components** (HIGH PRIORITY)

**Task 1**: Extend `DataTableDropdownAction` interface
- Add `confirmModal` property (optional)
- Keep `confirm` for backward compatibility
- Document migration path

**Task 2**: Update `data-table-dropdown.tsx`
- Add modal state management
- Add `DeleteConfirmationModal` rendering
- Support both `confirm` (legacy) and `confirmModal` (new)

**Task 3**: Update `data-table-standard.tsx` (bulk actions)
- Same as Task 2 but for bulk actions
- Add modal for bulk delete confirmations

**Task 4**: Migrate users page to use `confirmModal`
- Update dropdown actions in `users-content.tsx`
- Replace `confirm: "..."` with `confirmModal: { ... }`
- Test delete user, activate/deactivate

---

### **Phase 2: Fix Specific Modals** (MEDIUM PRIORITY)

**Task 5**: Fix `manage-statuses-modal.tsx`
- Add modal state
- Replace `confirm()` with `<DeleteConfirmationModal>`

**Task 6**: Fix `workflow-visualization-modal.tsx`
- Add modal state
- Replace `confirm()` with `<DeleteConfirmationModal>`

**Task 7**: Fix `manage-work-item-fields-modal.tsx`
- Add modal state
- Replace `confirm()` with `<DeleteConfirmationModal>`

---

### **Phase 3: Handle Unsaved Changes Warning** (LOW PRIORITY)

**Task 8**: Fix `edit-transition-config-modal.tsx`
- Different use case (unsaved changes warning, not delete)
- Options:
  - Create `UnsavedChangesModal` (specialized)
  - Use `DeleteConfirmationModal` with custom props (generic enough)
  - Create generic `ConfirmationModal` (even more generic)

---

## Complexity Analysis

### **Simple Cases** (4 files)
Easy to fix - just add modal state and replace `confirm()`:
- manage-statuses-modal.tsx
- workflow-visualization-modal.tsx
- manage-work-item-fields-modal.tsx
- edit-transition-config-modal.tsx

**Estimated time**: 10 min each = 40 minutes total

---

### **Complex Cases** (2 files)
Requires architectural changes to support modal callbacks:
- data-table-dropdown.tsx (affects 5+ pages)
- data-table-standard.tsx (affects bulk actions)

**Estimated time**: 1-2 hours

**Options**:
- **A**: Enhance components to support modals (recommended, future-proof)
- **B**: Keep native confirm for now, fix on page-by-page basis (quick but not scalable)
- **C**: Create wrapper components for each page (duplicates code)

---

## Example: Users Page Delete

### **Current Flow** (native confirm)
```
User clicks "..." → Dropdown opens → Click "Delete" →
Native browser confirm: "Are you sure you want to delete John Smith?" →
If OK: Delete user → Dropdown closes
```

### **Proposed Flow** (custom modal)
```
User clicks "..." → Dropdown opens → Click "Delete" →
Dropdown closes → Custom modal opens:
  [Red Icon]
  Delete User
  Are you sure you want to delete John Smith?
  This action cannot be undone.
  
  [Cancel] [Delete User]

If Delete: Delete user → Modal closes → Success toast
```

---

## Recommendation

### **Approach: Hybrid (Pragmatic)**

**Phase 1** (Quick - 40 minutes):
- Fix 4 simple modals (statuses, transitions, fields, unsaved changes)
- Immediate UX improvement for admin features

**Phase 2** (Medium - 1-2 hours):
- Enhance `data-table-dropdown` to support modal callbacks
- Migrate users page as example
- Leave backward compatibility for other pages

**Phase 3** (Later - defer):
- Migrate other data table pages when we have time
- Eventually deprecate `confirm` property

---

## Alternative: Quick Fix for Users Page Only

If you just want to fix the users page delete specifically:

**Option**: Override in `users-content.tsx`
```typescript
// Instead of using dropdown's confirm property
const getDropdownActions = (user: User) => [
  {
    label: 'Delete',
    onClick: () => {
      setDeleteModalOpen(true);
      setUserToDelete(user);
    },
    variant: 'danger',
    // No confirm property - handle modal in parent
  }
];

// Render modal in UsersContent
<DeleteConfirmationModal
  isOpen={deleteModalOpen}
  setIsOpen={setDeleteModalOpen}
  title="Delete User"
  itemName={`${userToDelete?.first_name} ${userToDelete?.last_name}`}
  message="This action cannot be undone."
  onConfirm={handleConfirmDeleteUser}
/>
```

**Estimated time**: 15 minutes  
**Scope**: Only fixes users page, not generic solution

---

## Recommended Action Plan

### **Option A: Complete Solution** (2-3 hours)
1. Fix 4 simple modals (40 min)
2. Enhance data table components (1-2 hours)
3. Migrate users page (20 min)
4. Test all affected pages (30 min)

### **Option B: Targeted Fix** (1 hour)
1. Fix users page only with custom delete modal (15 min)
2. Fix 4 simple modals (40 min)
3. Leave data table enhancement for later
4. Test (5 min)

### **Option C: Just Users Page** (15 min)
1. Override delete action in users-content.tsx
2. Add DeleteConfirmationModal to users page
3. Test

---

## Which Option Would You Prefer?

**Option A**: Complete solution, all pages get custom modals  
**Option B**: Balance - fix visible issues, enhance architecture  
**Option C**: Quick fix for users page only  

Let me know and I'll create the implementation todos!

