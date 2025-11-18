# Unified CRUD Modal System

A declarative, type-safe modal system for create and edit operations that eliminates code duplication and ensures consistency across all CRUD modals.

## Features

- ✅ **Single Component** - One modal handles both create and edit modes
- ✅ **Type-Safe** - Full TypeScript support with generics
- ✅ **Declarative Fields** - Define fields once, use everywhere
- ✅ **Two-Column Layout** - Responsive grid layout support
- ✅ **Custom Components** - Easy integration with custom fields
- ✅ **Conditional Rendering** - Show/hide fields based on form state
- ✅ **Built-in Validation** - Zod schema integration
- ✅ **Consistent UX** - Standardized styling and behavior

## Quick Start

### Basic Example

```typescript
import CrudModal from '@/components/crud-modal';
import type { FieldConfig } from '@/components/crud-modal/types';

interface UserFormData {
  first_name: string;
  last_name: string;
  email: string;
  is_active: boolean;
}

const userSchema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  email: z.string().email(),
  is_active: z.boolean(),
});

const fields: FieldConfig<UserFormData>[] = [
  {
    type: 'text',
    name: 'first_name',
    label: 'First Name',
    required: true,
    column: 'left',
  },
  {
    type: 'text',
    name: 'last_name',
    label: 'Last Name',
    required: true,
    column: 'right',
  },
  {
    type: 'email',
    name: 'email',
    label: 'Email',
    required: true,
  },
  {
    type: 'checkbox',
    name: 'is_active',
    label: 'Active User',
  },
];

function UserModal({ mode, user, isOpen, onClose }) {
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  const handleSubmit = async (data: UserFormData) => {
    if (mode === 'create') {
      await createUser.mutateAsync(data);
    } else if (user) {
      await updateUser.mutateAsync({ id: user.id, data });
    }
  };

  return (
    <CrudModal
      mode={mode}
      entity={user}
      title={mode === 'create' ? 'Add New User' : 'Edit User'}
      resourceName="user"
      isOpen={isOpen}
      onClose={onClose}
      schema={userSchema}
      defaultValues={{
        first_name: '',
        last_name: '',
        email: '',
        is_active: true,
      }}
      fields={fields}
      onSubmit={handleSubmit}
      size="4xl"
    />
  );
}
```

## Field Types

### Text Field

```typescript
{
  type: 'text',
  name: 'first_name',
  label: 'First Name',
  placeholder: 'Enter first name',
  required: true,
  maxLength: 255,
  helpText: 'This will appear on your profile',
  column: 'left', // or 'right' or 'full'
}
```

### Email Field

```typescript
{
  type: 'email',
  name: 'email',
  label: 'Email Address',
  required: true,
  maxLength: 255,
}
```

### Password Field

```typescript
{
  type: 'password',
  name: 'password',
  label: 'Password',
  required: true,
  maxLength: 128,
}
```

### Number Field

```typescript
{
  type: 'number',
  name: 'age',
  label: 'Age',
  min: 0,
  max: 120,
  step: 1,
}
```

### Textarea Field

```typescript
{
  type: 'textarea',
  name: 'description',
  label: 'Description',
  rows: 4,
  maxLength: 1000,
  placeholder: 'Enter description',
}
```

### Checkbox Field

```typescript
{
  type: 'checkbox',
  name: 'is_active',
  label: 'Active User',
  description: 'Enable this to allow user to log in',
}
```

### Select Field

```typescript
{
  type: 'select',
  name: 'priority',
  label: 'Priority',
  placeholder: 'Select priority',
  options: [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ],
  // Or dynamic options based on form state:
  options: (formData) => {
    return formData.someField ? optionsA : optionsB;
  },
}
```

### Custom Component Field

For custom components like `HierarchySelect`, `RoleSelector`, etc:

```typescript
{
  type: 'custom',
  name: 'organization_id',
  label: 'Organization',
  component: HierarchySelect,
  required: true,
  props: {
    items: organizations,
    idField: 'id',
    nameField: 'name',
    parentField: 'parent_organization_id',
    activeField: 'is_active',
    placeholder: 'Select an organization',
    showSearch: true,
    allowClear: false,
  },
  column: 'left',
}
```

**Custom Component Interface:**

Your custom component must accept these props:

```typescript
interface CustomFieldProps<TFormData> {
  name: keyof TFormData;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  formData?: TFormData;
  // ...any additional props from field.props
}
```

## Advanced Features

### Conditional Fields

Show/hide fields based on form state:

```typescript
{
  type: 'text',
  name: 'other_reason',
  label: 'Please specify',
  visible: (formData) => formData.reason === 'other',
}
```

### Dynamic Disabled State

Disable fields conditionally:

```typescript
{
  type: 'text',
  name: 'admin_code',
  label: 'Admin Code',
  disabled: (formData) => !formData.is_admin,
}
```

### Two-Column Layout

Use `column` property to create responsive two-column layouts:

```typescript
const fields = [
  // Full width (default)
  { type: 'email', name: 'email', label: 'Email' },

  // Two columns side-by-side
  { type: 'text', name: 'first_name', label: 'First Name', column: 'left' },
  { type: 'text', name: 'last_name', label: 'Last Name', column: 'right' },

  // Another full width field
  { type: 'textarea', name: 'bio', label: 'Bio' },
];
```

### Transform Data Before Submit

```typescript
<CrudModal
  // ... other props
  beforeSubmit={(data) => {
    // Transform data before sending to API
    return {
      ...data,
      name: data.name.trim(),
      slug: data.name.toLowerCase().replace(/\s+/g, '-'),
    };
  }}
/>
```

### Custom Success Message

```typescript
<CrudModal
  // ... other props
  successMessage="User created successfully! Welcome aboard!"
/>
```

### Disable Success Toast

```typescript
<CrudModal
  // ... other props
  showSuccessToast={false}
  afterSuccess={() => {
    // Custom success handling
    showCustomNotification();
  }}
/>
```

## Modal Sizes

Available sizes: `sm`, `md`, `lg`, `xl`, `2xl`, `4xl`

```typescript
<CrudModal
  size="4xl" // Larger modals for complex forms
  // ... other props
/>
```

## Migration Guide

### Before (Duplicate Modals)

```typescript
// add-user-modal.tsx (435 lines)
export function AddUserModal({ isOpen, onClose }) {
  // Lots of form logic...
}

// edit-user-modal.tsx (627 lines)
export function EditUserModal({ isOpen, onClose, user }) {
  // Duplicate form logic...
}
```

### After (Unified Modal)

```typescript
// user-modal.tsx (~100 lines)
export function UserModal({ mode, user, isOpen, onClose }) {
  const fields = [...]; // Define once

  return (
    <CrudModal
      mode={mode}
      entity={user}
      // ... config
    />
  );
}

// Usage
<UserModal mode="create" isOpen={showCreate} onClose={handleClose} />
<UserModal mode="edit" user={selectedUser} isOpen={showEdit} onClose={handleClose} />
```

## Best Practices

1. **Define fields once** - Create a `getUserFields()` function if fields need to be dynamic
2. **Use proper TypeScript types** - Define form data interfaces
3. **Validate with Zod** - Create comprehensive validation schemas
4. **Group related fields** - Use two-column layout for better UX
5. **Add helpful text** - Use `helpText` for clarification
6. **Handle errors gracefully** - Zod validation errors automatically display

## Examples

See the following files for real-world examples:
- Phase 1 migrations (coming soon)
- Phase 2 migrations (coming soon)

## Troubleshooting

### TypeScript Errors

Ensure your form data type extends `FieldValues`:

```typescript
import type { FieldValues } from 'react-hook-form';

interface MyFormData extends FieldValues {
  name: string;
  age: number;
}
```

### Field Not Showing

Check the `visible` property - it might be conditionally hidden.

### Custom Component Not Working

Ensure your component accepts all required props from `CustomFieldProps<TFormData>`.

## API Reference

See [types.ts](./types.ts) for complete type definitions.
