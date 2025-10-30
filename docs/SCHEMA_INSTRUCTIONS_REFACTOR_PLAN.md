# Schema Instructions Refactor Plan

**Goal**: Move schema instructions from modal to dedicated page with DataTable  
**Reason**: Too much data for modal, better UX with full page  
**Todos**: 19 items, ~4 hours

---

## Current State

**Schema Instructions Modal** (`components/schema-instructions-modal.tsx`):
- Opened from "Schema Rules" button in metadata page
- Lists all instructions in scrollable modal
- Has inline create/edit form
- ❌ Problem: Too cramped, nested modals

---

## Target State

**Schema Instructions Page** (`/data/explorer/schema-instructions`):
- Dedicated page with full DataTable-standard
- Sidebar navigation link
- Professional CRUD operations
- Separate modals for create/edit

---

## Implementation Plan

### 1. Page Structure (3 todos)

**Create Page Wrapper**:
```typescript
// app/(default)/data/explorer/schema-instructions/page.tsx
import { SelectedItemsProvider } from '@/app/selected-items-context';
import SchemaInstructionsContent from './instructions-content';

export const metadata = {
  title: 'Schema Instructions',
  description: 'Manage global query rules for SQL generation',
};

export default function SchemaInstructionsPage() {
  return (
    <SelectedItemsProvider>
      <SchemaInstructionsContent />
    </SelectedItemsProvider>
  );
}
```

**Create Content Component**:
```typescript
// app/(default)/data/explorer/schema-instructions/instructions-content.tsx
'use client';

import DataTable, { type DataTableColumn, type DataTableDropdownAction } from '@/components/data-table-standard';
import { useSchemaInstructions } from '@/lib/hooks/use-data-explorer';
import type { SchemaInstruction } from '@/lib/types/data-explorer';

export default function SchemaInstructionsContent() {
  const { data: instructions = [], isLoading, refetch } = useSchemaInstructions();
  
  // DataTable implementation
}
```

**Add Navigation**:
```typescript
// components/ui/sidebar/data-explorer-menu-section.tsx
<li className="mb-1 last:mb-0">
  <SidebarLink href="/data/explorer/schema-instructions">
    <span className="text-sm font-medium">
      Instructions
    </span>
  </SidebarLink>
</li>
```

---

### 2. DataTable Configuration (4 todos)

**Define Columns**:
```typescript
const columns: DataTableColumn<SchemaInstruction & { id: string }>[] = [
  { 
    key: 'title', 
    header: 'Title', 
    sortable: true,
    width: 200,
  },
  {
    key: 'instruction',
    header: 'Instruction',
    render: (item) => (
      <div className="max-w-md truncate" title={item.instruction}>
        {item.instruction}
      </div>
    ),
  },
  {
    key: 'category',
    header: 'Category',
    sortable: true,
    width: 120,
    render: (item) => getCategoryBadge(item.category),
  },
  {
    key: 'priority',
    header: 'Priority',
    sortable: true,
    width: 100,
    render: (item) => getPriorityBadge(item.priority),
  },
  {
    key: 'is_active',
    header: 'Status',
    sortable: true,
    width: 100,
    render: (item) => (
      <span className={`px-2 py-1 text-xs rounded ${item.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
        {item.is_active ? 'Active' : 'Disabled'}
      </span>
    ),
  },
  { key: 'actions', header: 'Actions', width: 120 },
];
```

**Dropdown Actions**:
```typescript
const getDropdownActions = (
  item: SchemaInstruction & { id: string }
): DataTableDropdownAction<SchemaInstruction & { id: string }>[] => [
  {
    label: 'Edit',
    onClick: (inst) => {
      setSelectedInstruction(inst);
      setIsEditModalOpen(true);
    },
  },
  {
    label: item.is_active ? 'Disable' : 'Enable',
    onClick: async (inst) => {
      await apiClient.put(`/api/data/explorer/schema-instructions/${inst.instruction_id}`, {
        is_active: !inst.is_active,
      });
      refetch();
    },
  },
  {
    label: 'Delete',
    variant: 'danger',
    onClick: async (inst) => {
      await apiClient.delete(`/api/data/explorer/schema-instructions/${inst.instruction_id}`);
      refetch();
    },
    confirmModal: {
      title: (_item) => 'Delete Schema Instruction',
      message: (inst) => `Delete "${inst.title}"? This will stop the AI from following this rule.`,
      confirmText: 'Delete Instruction',
    },
  },
];
```

---

### 3. React Query Hook (1 todo)

**Create Hook**:
```typescript
// lib/hooks/use-data-explorer.ts
export function useSchemaInstructions() {
  return useApiQuery<SchemaInstruction[]>(
    ['data-explorer', 'schema-instructions'],
    '/api/data/explorer/schema-instructions',
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
    }
  );
}
```

---

### 4. Modals (2 todos)

**Extract Create Modal**:
```typescript
// components/create-schema-instruction-modal.tsx
// Uses same form as current modal
```

**Extract Edit Modal**:
```typescript
// components/edit-schema-instruction-modal.tsx
// Uses same form as current modal
```

---

### 5. Page Header (1 todo)

```typescript
<div className="sm:flex sm:justify-between sm:items-center mb-8">
  <div className="mb-4 sm:mb-0">
    <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
      Schema Instructions
    </h1>
    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
      Global rules that guide AI SQL generation
    </p>
  </div>

  <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-2">
    <ProtectedComponent permission="data-explorer:metadata:manage:all">
      <button
        type="button"
        onClick={() => setIsCreateModalOpen(true)}
        className="btn bg-violet-500 hover:bg-violet-600 text-white"
      >
        <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 16 16">
          <path d="M15 7H9V1c0-.6-.4-1-1-1S7 .4 7 1v6H1c-.6 0-1 .4-1 1s.4 1 1 1h6v6c0 .6.4 1 1 1s1-.4 1-1V9h6c.6 0 1-.4 1-1s-.4-1-1-1z" />
        </svg>
        <span className="ml-2">Add Instruction</span>
      </button>
    </ProtectedComponent>
  </div>
</div>
```

---

## File Structure

```
app/(default)/data/explorer/
  schema-instructions/
    page.tsx                      # Wrapper with provider
    instructions-content.tsx      # Main component with DataTable

components/
  create-schema-instruction-modal.tsx   # Create form
  edit-schema-instruction-modal.tsx     # Edit form
  schema-instructions-modal.tsx         # DELETE (no longer needed)

lib/hooks/
  use-data-explorer.ts          # Add useSchemaInstructions hook
```

---

## Standards Compliance

**Following STANDARDS.md**:
- ✅ Uses DataTable-standard component
- ✅ SelectedItemsProvider wrapper
- ✅ Dropdown actions for row operations
- ✅ Confirmation modals for destructive actions
- ✅ React Query for data fetching
- ✅ Permission guards on buttons
- ✅ Page metadata (title, description)

**Following Existing Patterns**:
- Same structure as `/data/explorer/metadata`
- Same structure as `/configure/users`
- Consistent with codebase conventions

---

## Todos Summary

**Page Creation** (3 todos):
1. Create page wrapper
2. Create content component
3. Add navigation link

**DataTable Setup** (4 todos):
4. Define columns with custom renders
5. Implement dropdown actions
6. Add confirmation modals
7. Add header with Add button

**React Query** (1 todo):
12. Create useSchemaInstructions hook

**Modals** (2 todos):
8. Extract create modal
9. Extract edit modal

**Wiring** (2 todos):
10. Wire edit modal
11. Wire create modal

**Cleanup** (1 todo):
14. Remove old modal button

**Testing** (4 todos):
15-18. Page metadata, CRUD testing

**Validation** (2 todos):
18-19. TypeScript/lint, SQL generation

**Total**: 19 todos, ~4 hours

---

## Benefits of Refactor

**Better UX**:
- Full page real estate
- Professional table layout
- No nested modals
- Searchable, sortable
- Paginated if needed

**Maintainability**:
- Follows standards
- Consistent with other pages
- Easier to extend

**User Experience**:
- Can see all instructions at once
- Better for 10+ instructions
- Professional appearance

---

**Ready to implement?** All 19 todos are scoped and ready.

