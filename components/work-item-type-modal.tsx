'use client';

import { z } from 'zod';
import { useAuth } from '@/components/auth/rbac-auth-provider';
import { useOrganizations } from '@/lib/hooks/use-organizations';
import {
  type WorkItemType,
  useCreateWorkItemType,
  useUpdateWorkItemType,
} from '@/lib/hooks/use-work-item-types';
import { createSafeTextSchema } from '@/lib/validations/sanitization';
import ColorPicker from './color-picker';
import CrudModal from './crud-modal';
import type { FieldConfig, CustomFieldProps } from './crud-modal/types';
import EmojiPicker from './emoji-picker';
import HierarchySelect from './hierarchy-select';

// Create schema
const createWorkItemTypeSchema = z.object({
  name: createSafeTextSchema(1, 255, 'Type name'),
  description: createSafeTextSchema(0, 1000, 'Description').optional(),
  icon: z.string().max(10, 'Icon must not exceed 10 characters').optional(),
  color: z.string().max(50, 'Color must not exceed 50 characters').optional(),
  organization_id: z.string().uuid('Invalid organization'),
  is_active: z.boolean().optional(),
});

// Edit schema (all fields optional except those we're updating)
const editWorkItemTypeSchema = z.object({
  name: createSafeTextSchema(1, 255, 'Type name').optional(),
  description: createSafeTextSchema(0, 1000, 'Description').optional().nullable(),
  icon: z.string().max(10, 'Icon must not exceed 10 characters').optional().nullable(),
  color: z.string().max(50, 'Color must not exceed 50 characters').optional().nullable(),
  is_active: z.boolean().optional(),
});

type CreateWorkItemTypeFormData = z.infer<typeof createWorkItemTypeSchema>;
type EditWorkItemTypeFormData = z.infer<typeof editWorkItemTypeSchema>;
type WorkItemTypeFormData = CreateWorkItemTypeFormData | EditWorkItemTypeFormData;

interface WorkItemTypeModalProps {
  mode: 'create' | 'edit';
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  workItemType?: WorkItemType | null;
}

// Adapter for organization selector
function OrganizationSelectAdapter({ value, onChange, error, disabled }: CustomFieldProps<WorkItemTypeFormData>) {
  const { data: organizations = [] } = useOrganizations();

  return (
    <HierarchySelect
      items={organizations}
      value={value as string | undefined}
      onChange={(id) => onChange(id as string || '')}
      idField="id"
      nameField="name"
      parentField="parent_organization_id"
      activeField="is_active"
      label="Organization"
      placeholder="Select an organization"
      required
      {...(disabled !== undefined && { disabled })}
      showSearch
      allowClear={false}
      rootLabel="None (Root Organization)"
      {...(error && { error })}
    />
  );
}

// Adapter for color picker
function ColorPickerAdapter({ value, onChange }: CustomFieldProps<WorkItemTypeFormData>) {
  return (
    <ColorPicker
      label="Color"
      value={(value as string) || ''}
      onChange={(color) => onChange(color)}
      defaultColor="#3b82f6"
      description="Pick from presets or enter a custom hex color"
    />
  );
}

// Adapter for emoji picker
function EmojiPickerAdapter({ value, onChange }: CustomFieldProps<WorkItemTypeFormData>) {
  return (
    <EmojiPicker
      label="Icon"
      value={(value as string) || ''}
      onChange={(emoji) => onChange(emoji)}
      description="Pick an emoji to represent this work item type"
    />
  );
}

export default function WorkItemTypeModal({
  mode,
  isOpen,
  onClose,
  onSuccess,
  workItemType,
}: WorkItemTypeModalProps) {
  const createWorkItemType = useCreateWorkItemType();
  const updateWorkItemType = useUpdateWorkItemType();
  const { userContext } = useAuth();

  const fields: FieldConfig<WorkItemTypeFormData>[] = [
    {
      type: 'text',
      name: 'name',
      label: 'Name',
      placeholder: 'e.g., Bug Report, Feature Request',
      required: mode === 'create',
    },
    {
      type: 'textarea',
      name: 'description',
      label: 'Description',
      placeholder: 'Describe this work item type...',
      rows: 3,
    },
    {
      type: 'custom',
      name: 'icon',
      label: 'Icon',
      component: EmojiPickerAdapter,
      props: {},
    },
    {
      type: 'custom',
      name: 'color',
      label: 'Color',
      component: ColorPickerAdapter,
      props: {},
    },
    {
      type: 'custom',
      name: 'organization_id' as never,
      label: 'Organization',
      required: true,
      component: OrganizationSelectAdapter,
      props: {},
      visible: (_formData) => mode === 'create',
    },
    {
      type: 'checkbox',
      name: 'is_active',
      label: 'Active',
    },
  ];

  const handleSubmit = async (data: WorkItemTypeFormData) => {
    if (mode === 'create') {
      const createData = data as CreateWorkItemTypeFormData;
      // Filter out undefined values for exactOptionalPropertyTypes
      const filteredData: {
        organization_id: string;
        name: string;
        description?: string;
        icon?: string;
        color?: string;
        is_active?: boolean;
      } = {
        organization_id: createData.organization_id,
        name: createData.name,
      };
      if (createData.description !== undefined) filteredData.description = createData.description;
      if (createData.icon !== undefined) filteredData.icon = createData.icon;
      if (createData.color !== undefined) filteredData.color = createData.color;
      if (createData.is_active !== undefined) filteredData.is_active = createData.is_active;

      await createWorkItemType.mutateAsync(filteredData);
    } else if (workItemType) {
      const editData = data as EditWorkItemTypeFormData;
      // Filter out undefined values for exactOptionalPropertyTypes
      const filteredData: {
        name?: string;
        description?: string | null;
        icon?: string | null;
        color?: string | null;
        is_active?: boolean;
      } = {};
      if (editData.name !== undefined) filteredData.name = editData.name;
      if (editData.description !== undefined) filteredData.description = editData.description || null;
      if (editData.icon !== undefined) filteredData.icon = editData.icon || null;
      if (editData.color !== undefined) filteredData.color = editData.color || null;
      if (editData.is_active !== undefined) filteredData.is_active = editData.is_active;

      await updateWorkItemType.mutateAsync({
        id: workItemType.id,
        data: filteredData,
      });
    }
  };

  return (
    <CrudModal
      mode={mode}
      entity={workItemType as never}
      title={mode === 'create' ? 'Add Work Item Type' : 'Edit Work Item Type'}
      resourceName="work item type"
      isOpen={isOpen}
      onClose={onClose}
      {...(onSuccess && { onSuccess })}
      schema={(mode === 'create' ? createWorkItemTypeSchema : editWorkItemTypeSchema) as never}
      defaultValues={{
        name: '',
        description: '',
        icon: '',
        color: '',
        organization_id: userContext?.current_organization_id || '',
        is_active: true,
      } as never}
      fields={fields}
      onSubmit={handleSubmit}
      size="2xl"
      successMessage={
        mode === 'create'
          ? 'Work item type created successfully!'
          : 'Work item type updated successfully!'
      }
    />
  );
}
