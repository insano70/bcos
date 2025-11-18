'use client';

import { z } from 'zod';
import {
  type Organization,
  useCreateOrganization,
  useUpdateOrganization,
  useOrganizations,
} from '@/lib/hooks/use-organizations';
import { createSafeTextSchema } from '@/lib/validations/sanitization';
import CrudModal from './crud-modal';
import type { FieldConfig, CustomFieldProps } from './crud-modal/types';
import HierarchySelect from './hierarchy-select';

const organizationSchema = z.object({
  name: createSafeTextSchema(1, 255, 'Organization name'),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(100, 'Slug must not exceed 100 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .transform((val) => val.toLowerCase()),
  parent_organization_id: z.string().uuid().optional().nullable(),
  practice_uids_input: z.string().optional(),
  is_active: z.boolean().optional(),
});

type OrganizationFormData = z.infer<typeof organizationSchema>;

interface OrganizationModalProps {
  mode: 'create' | 'edit';
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  organization?: Organization | null;
}

// Adapter for parent organization selector
function ParentOrganizationAdapter({ value, onChange, error, disabled }: CustomFieldProps<OrganizationFormData>) {
  const { data: organizations = [] } = useOrganizations();

  return (
    <HierarchySelect
      items={organizations}
      value={value as string | undefined}
      onChange={(id) => onChange(id as string || null)}
      idField="id"
      nameField="name"
      parentField="parent_organization_id"
      activeField="is_active"
      label="Parent Organization"
      placeholder="None (Root Organization)"
      {...(disabled !== undefined && { disabled })}
      showSearch
      allowClear
      rootLabel="None (Root Organization)"
      {...(error && { error })}
    />
  );
}

export default function OrganizationModal({
  mode,
  isOpen,
  onClose,
  onSuccess,
  organization,
}: OrganizationModalProps) {
  const createOrganization = useCreateOrganization();
  const updateOrganization = useUpdateOrganization();

  // Transform entity for edit mode
  const transformedEntity = organization
    ? {
        ...organization,
        practice_uids_input: organization.practice_uids?.join(', ') || '',
      }
    : null;

  const fields: FieldConfig<OrganizationFormData>[] = [
    {
      type: 'text',
      name: 'name',
      label: 'Organization Name',
      placeholder: 'Enter organization name',
      required: true,
    },
    {
      type: 'text',
      name: 'slug',
      label: 'Slug',
      placeholder: 'organization-slug',
      helpText: 'URL-friendly identifier (lowercase, numbers, hyphens only)',
      required: true,
    },
    {
      type: 'custom',
      name: 'parent_organization_id',
      label: 'Parent Organization',
      component: ParentOrganizationAdapter,
      props: {},
    },
    {
      type: 'textarea',
      name: 'practice_uids_input',
      label: 'Practice UIDs',
      placeholder: '100, 101, 102',
      rows: 2,
      helpText: 'Comma-separated list of practice_uid values from analytics database (ih.agg_app_measures). Users in this organization can only see data where practice_uid matches these values. Leave empty to restrict all analytics access (fail-closed security).',
    },
    {
      type: 'checkbox',
      name: 'is_active',
      label: 'Active',
    },
  ];

  const handleSubmit = async (data: OrganizationFormData) => {
    // Parse practice_uids from comma-separated string to integer array
    let practice_uids: number[] = [];
    if (data.practice_uids_input?.trim()) {
      practice_uids = data.practice_uids_input
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => parseInt(s, 10))
        .filter((n) => !Number.isNaN(n) && n > 0);
    }

    if (mode === 'create') {
      await createOrganization.mutateAsync({
        name: data.name,
        slug: data.slug,
        parent_organization_id: data.parent_organization_id ?? undefined,
        practice_uids,
        is_active: data.is_active ?? true,
      });
    } else if (organization) {
      await updateOrganization.mutateAsync({
        id: organization.id,
        data: {
          name: data.name,
          slug: data.slug,
          parent_organization_id: data.parent_organization_id ?? null,
          practice_uids,
          is_active: data.is_active ?? true,
        },
      });
    }
  };

  return (
    <CrudModal
      mode={mode}
      entity={transformedEntity as never}
      title={mode === 'create' ? 'Add New Organization' : 'Edit Organization'}
      resourceName="organization"
      isOpen={isOpen}
      onClose={onClose}
      {...(onSuccess && { onSuccess })}
      schema={organizationSchema as never}
      defaultValues={{
        name: '',
        slug: '',
        parent_organization_id: null,
        practice_uids_input: '',
        is_active: true,
      } as never}
      fields={fields}
      onSubmit={handleSubmit}
      size="md"
      successMessage={
        mode === 'create'
          ? 'Organization created successfully!'
          : 'Organization updated successfully!'
      }
    />
  );
}
