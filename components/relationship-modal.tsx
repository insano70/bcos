'use client';

import { z } from 'zod';
import { useAuth } from '@/components/auth/rbac-auth-provider';
import CrudModal from './crud-modal';
import type { FieldConfig, CustomFieldProps } from './crud-modal/types';
import {
  useCreateTypeRelationship,
  useUpdateTypeRelationship,
  useTypeRelationshipsForParent,
  type WorkItemTypeRelationship,
} from '@/lib/hooks/use-work-item-type-relationships';
import { useWorkItemTypes } from '@/lib/hooks/use-work-item-types';
import { createSafeTextSchema } from '@/lib/validations/sanitization';
import AutoCreateConfigBuilder, { type AutoCreateConfig } from './auto-create-config-builder';

// Auto create config custom component
function AutoCreateConfigField({ value, onChange, formData, disabled }: CustomFieldProps<RelationshipFormData>) {
  const childTypeId = formData?.child_type_id as string | undefined;
  const config = value as AutoCreateConfig | null;

  if (!childTypeId) {
    return null;
  }

  return (
    <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg">
      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
        Auto-Create Configuration
      </h4>
      <AutoCreateConfigBuilder
        childTypeId={childTypeId}
        value={config}
        onChange={onChange}
        disabled={disabled ?? false}
      />
    </div>
  );
}

// Schema with custom refinement for min/max count
const createRelationshipSchema = z
  .object({
    child_type_id: z.string().uuid('Please select a child type'),
    relationship_name: createSafeTextSchema(1, 100, 'Relationship name'),
    is_required: z.boolean().default(false),
    min_count: z.preprocess(
      (val) => (val === '' || val === null || val === undefined ? undefined : val),
      z.coerce.number().int().min(0).optional()
    ),
    max_count: z.preprocess(
      (val) => (val === '' || val === null || val === undefined ? undefined : val),
      z.coerce.number().int().min(1).optional()
    ),
    auto_create: z.boolean().default(false),
    display_order: z.coerce.number().int().min(0).default(0),
    auto_create_config: z.custom<AutoCreateConfig>().nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.min_count !== undefined && data.max_count !== undefined) {
        return data.min_count <= data.max_count;
      }
      return true;
    },
    {
      message: 'Minimum count must be less than or equal to maximum count',
      path: ['min_count'],
    }
  );

// Edit schema (no child_type_id)
const editRelationshipSchema = z
  .object({
    relationship_name: createSafeTextSchema(1, 100, 'Relationship name'),
    is_required: z.boolean().default(false),
    min_count: z.preprocess(
      (val) => (val === '' || val === null || val === undefined ? undefined : val),
      z.coerce.number().int().min(0).optional()
    ),
    max_count: z.preprocess(
      (val) => (val === '' || val === null || val === undefined ? undefined : val),
      z.coerce.number().int().min(1).optional()
    ),
    auto_create: z.boolean().default(false),
    display_order: z.coerce.number().int().min(0).default(0),
    auto_create_config: z.custom<AutoCreateConfig>().nullable().optional(),
    child_type_id: z.string().optional(), // For AutoCreateConfigBuilder
  })
  .refine(
    (data) => {
      if (data.min_count !== undefined && data.max_count !== undefined) {
        return data.min_count <= data.max_count;
      }
      return true;
    },
    {
      message: 'Minimum count must be less than or equal to maximum count',
      path: ['min_count'],
    }
  );

type CreateRelationshipFormData = z.infer<typeof createRelationshipSchema>;
type EditRelationshipFormData = z.infer<typeof editRelationshipSchema>;
type RelationshipFormData = CreateRelationshipFormData | EditRelationshipFormData;

interface RelationshipModalProps {
  mode: 'create' | 'edit';
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  parentTypeId: string;
  relationship?: WorkItemTypeRelationship | null;
}

export default function RelationshipModal({
  mode,
  isOpen,
  onClose,
  onSuccess,
  parentTypeId,
  relationship,
}: RelationshipModalProps) {
  const createRelationship = useCreateTypeRelationship();
  const updateRelationship = useUpdateTypeRelationship();
  const { userContext } = useAuth();

  const { data: workItemTypes = [] } = useWorkItemTypes(
    userContext?.current_organization_id
      ? {
          organization_id: userContext.current_organization_id,
          is_active: true,
        }
      : { is_active: true }
  );

  // Get existing relationships to filter out already-configured child types
  const { data: existingRelationships = [] } = useTypeRelationshipsForParent(
    mode === 'create' ? parentTypeId : undefined
  );

  // Filter out the parent type AND already-configured child types from available options
  const existingChildTypeIds = new Set(existingRelationships.map((r) => r.child_type_id));
  const availableChildTypes = workItemTypes.filter(
    (type) => type.id !== parentTypeId && !existingChildTypeIds.has(type.id)
  );

  // Transform entity for edit mode
  const transformedEntity = relationship
    ? {
        ...relationship,
        auto_create_config: relationship.auto_create_config || null,
        child_type_id: relationship.child_type_id, // For AutoCreateConfigBuilder
      }
    : null;

  const fields: FieldConfig<RelationshipFormData>[] = [
    {
      type: 'select',
      name: 'child_type_id' as never,
      label: 'Child Type',
      required: true,
      column: 'full',
      options: [
        { value: '', label: 'Select a child type...', disabled: true },
        ...availableChildTypes.map((type) => ({
          value: type.id,
          label: type.icon ? `${type.icon} ${type.name}` : type.name,
        })),
      ],
      visible: (_formData) => mode === 'create',
    },
    {
      type: 'text',
      name: 'relationship_name' as never,
      label: 'Relationship Name',
      placeholder: 'e.g., patient, document, subtask',
      helpText: 'A descriptive name for this relationship (e.g., "patient", "subtask")',
      required: true,
      column: 'full',
    },
    {
      type: 'number',
      name: 'min_count' as never,
      label: 'Minimum Count',
      placeholder: '0',
      min: 0,
      column: 'left',
    },
    {
      type: 'number',
      name: 'max_count' as never,
      label: 'Maximum Count',
      placeholder: 'No limit',
      min: 1,
      column: 'right',
    },
    {
      type: 'number',
      name: 'display_order' as never,
      label: 'Display Order',
      placeholder: '0',
      min: 0,
      column: 'full',
    },
    {
      type: 'checkbox',
      name: 'is_required' as never,
      label: 'Required (Child items of this type must exist)',
      column: 'full',
    },
    {
      type: 'checkbox',
      name: 'auto_create' as never,
      label: 'Auto-create (Automatically create child items when parent is created)',
      column: 'full',
    },
    {
      type: 'custom',
      name: 'auto_create_config' as never,
      label: '',
      column: 'full',
      component: AutoCreateConfigField,
      props: {},
      visible: (formData) => {
        return formData.auto_create === true;
      },
    },
  ];

  const handleSubmit = async (data: RelationshipFormData) => {
    if (mode === 'create') {
      const createData = data as CreateRelationshipFormData;
      await createRelationship.mutateAsync({
        parent_type_id: parentTypeId,
        child_type_id: createData.child_type_id,
        relationship_name: createData.relationship_name,
        is_required: createData.is_required ?? false,
        min_count: createData.min_count,
        max_count: createData.max_count,
        auto_create: createData.auto_create ?? false,
        display_order: createData.display_order ?? 0,
        auto_create_config:
          createData.auto_create && createData.auto_create_config
            ? createData.auto_create_config
            : undefined,
      });
    } else if (relationship) {
      const editData = data as EditRelationshipFormData;
      await updateRelationship.mutateAsync({
        id: relationship.work_item_type_relationship_id,
        data: {
          relationship_name: editData.relationship_name,
          is_required: editData.is_required,
          min_count: editData.min_count,
          max_count: editData.max_count,
          auto_create: editData.auto_create,
          display_order: editData.display_order,
          auto_create_config:
            editData.auto_create && editData.auto_create_config
              ? editData.auto_create_config
              : undefined,
        },
      });
    }
  };

  // Create read-only info display for edit mode
  const infoDisplay = relationship
    ? `${relationship.child_type_name} • Child type cannot be changed`
    : undefined;

  return (
    <CrudModal
      mode={mode}
      entity={transformedEntity as never}
      title={mode === 'create' ? 'Add Child Type Relationship' : `Edit Relationship - ${relationship?.child_type_name || ''}`}
      resourceName="relationship"
      isOpen={isOpen}
      onClose={onClose}
      {...(onSuccess && { onSuccess })}
      schema={(mode === 'create' ? createRelationshipSchema : editRelationshipSchema) as never}
      defaultValues={
        {
          child_type_id: '',
          relationship_name: '',
          is_required: false,
          min_count: undefined,
          max_count: undefined,
          auto_create: false,
          display_order: 0,
          auto_create_config: null,
        } as never
      }
      fields={fields}
      onSubmit={handleSubmit}
      size="2xl"
      successMessage={
        mode === 'create' ? 'Relationship created successfully' : 'Relationship updated successfully'
      }
      {...(mode === 'edit' && infoDisplay && { infoDisplay })}
    />
  );
}
