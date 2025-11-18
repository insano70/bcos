'use client';

import { z } from 'zod';
import { useUpdateTableMetadata } from '@/lib/hooks/use-data-explorer';
import { apiClient } from '@/lib/api/client';
import type { TableMetadata } from '@/lib/types/data-explorer';
import CrudModal from './crud-modal';
import type { FieldConfig } from './crud-modal/types';

const tableMetadataSchema = z.object({
  schema_name: z.string().min(1, 'Schema name is required'),
  table_name: z.string().min(1, 'Table name is required'),
  display_name: z.string().optional(),
  description: z.string().optional(),
  row_meaning: z.string().optional(),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  sample_questions: z.string().optional(),
  common_filters: z.string().optional(),
});

type TableMetadataFormData = z.infer<typeof tableMetadataSchema>;

interface TableMetadataModalProps {
  mode: 'create' | 'edit';
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  tableMetadata?: TableMetadata | null;
}

export default function TableMetadataModal({
  mode,
  isOpen,
  onClose,
  onSuccess,
  tableMetadata,
}: TableMetadataModalProps) {
  const updateMetadata = useUpdateTableMetadata();

  // Transform entity for form (convert arrays to strings for textarea fields)
  const transformedEntity = tableMetadata
    ? {
        ...tableMetadata,
        sample_questions: tableMetadata.sample_questions?.join('\n') || '',
        common_filters: tableMetadata.common_filters?.join(', ') || '',
      }
    : null;

  // Build fields with conditional help text to satisfy exactOptionalPropertyTypes
  const descriptionHelpText = mode === 'edit' ? 'Be specific about what each row represents and what business domain it covers.' : undefined;
  const tierHelpText = mode === 'edit' ? 'Tier 1 tables are prioritized for AI SQL generation' : undefined;

  const fields: FieldConfig<TableMetadataFormData>[] = [
    {
      type: 'text',
      name: 'schema_name',
      label: 'Schema Name',
      required: true,
      column: 'left',
      visible: (_formData) => mode === 'create',
    },
    {
      type: 'text',
      name: 'table_name',
      label: 'Table Name',
      placeholder: 'e.g., my_custom_table',
      required: true,
      column: 'right',
      visible: (_formData) => mode === 'create',
    },
    {
      type: 'text',
      name: 'display_name',
      label: 'Display Name',
      placeholder: 'Friendly name for this table',
    },
    {
      type: 'textarea',
      name: 'description',
      label: 'Description',
      placeholder: 'What data does this table contain? This helps the AI understand context.',
      rows: 3,
      ...(descriptionHelpText && { helpText: descriptionHelpText }),
      required: mode === 'edit',
    },
    {
      type: 'text',
      name: 'row_meaning',
      label: 'Row Meaning',
      placeholder: 'e.g., Each row represents a patient visit',
      visible: (_formData) => mode === 'edit',
    },
    {
      type: 'select',
      name: 'tier',
      label: 'Tier',
      ...(tierHelpText && { helpText: tierHelpText }),
      options: [
        { value: 1, label: 'Tier 1 - Core (Most Important)' },
        { value: 2, label: 'Tier 2 - Secondary' },
        { value: 3, label: 'Tier 3 - Auxiliary' },
      ],
    },
    {
      type: 'textarea',
      name: 'sample_questions',
      label: 'Sample Questions',
      placeholder: 'Enter example questions, one per line:\nWhat is total revenue for January 2024?\nShow me patient visit trends by month\nWhich providers have the highest volume?',
      rows: 4,
      helpText: 'One question per line. These help guide users on what to ask.',
      visible: (_formData) => mode === 'edit',
    },
    {
      type: 'text',
      name: 'common_filters',
      label: 'Common Filters',
      placeholder: 'practice_uid, date_index, measure, frequency',
      helpText: 'Comma-separated list of commonly filtered columns',
      visible: (_formData) => mode === 'edit',
    },
  ];

  const handleSubmit = async (data: TableMetadataFormData) => {
    if (mode === 'create') {
      await apiClient.post('/api/data/explorer/metadata/tables', {
        schema_name: data.schema_name,
        table_name: data.table_name,
        display_name: data.display_name || undefined,
        description: data.description || undefined,
        tier: data.tier,
      });
    } else if (tableMetadata) {
      await updateMetadata.mutateAsync({
        id: tableMetadata.table_metadata_id,
        data: {
          ...(data.display_name && { display_name: data.display_name }),
          ...(data.description && { description: data.description }),
          ...(data.row_meaning && { row_meaning: data.row_meaning }),
          tier: data.tier,
          ...(data.sample_questions && {
            sample_questions: data.sample_questions.split('\n').filter((q) => q.trim()),
          }),
          ...(data.common_filters && {
            common_filters: data.common_filters.split(',').map((f) => f.trim()).filter(Boolean),
          }),
        },
      });
    }
  };

  return (
    <CrudModal
      mode={mode}
      entity={transformedEntity}
      title={mode === 'create' ? 'Add Table Metadata' : 'Edit Table Metadata'}
      resourceName="table metadata"
      isOpen={isOpen}
      onClose={onClose}
      onSuccess={onSuccess}
      schema={tableMetadataSchema as never}
      defaultValues={{
        schema_name: 'ih',
        table_name: '',
        display_name: '',
        description: '',
        row_meaning: '',
        tier: 3,
        sample_questions: '',
        common_filters: '',
      }}
      fields={fields}
      onSubmit={handleSubmit}
      size="2xl"
      successMessage={
        mode === 'create'
          ? 'Table metadata created successfully'
          : 'Table metadata updated successfully'
      }
    />
  );
}
