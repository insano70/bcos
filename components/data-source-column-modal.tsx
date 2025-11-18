'use client';

import { z } from 'zod';
import {
  type DataSourceColumn,
  useCreateDataSourceColumn,
  useUpdateDataSourceColumn,
} from '@/lib/hooks/use-data-sources';
import CrudModal from './crud-modal';
import type { FieldConfig } from './crud-modal/types';

// Create schema with column_name and data_type required
const createDataSourceColumnSchema = z.object({
  column_name: z
    .string()
    .min(1, 'Column name is required')
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_]*$/,
      'Column name must start with a letter and contain only letters, numbers, and underscores'
    ),
  display_name: z.string().min(1, 'Display name is required'),
  column_description: z.string().optional(),
  data_type: z.enum(['text', 'integer', 'decimal', 'boolean', 'date', 'timestamp', 'json']),
  sort_order: z.number().optional(),
  access_level: z.string().optional(),
  is_filterable: z.boolean().optional(),
  is_groupable: z.boolean().optional(),
  is_measure: z.boolean().optional(),
  is_dimension: z.boolean().optional(),
  is_date_field: z.boolean().optional(),
  is_measure_type: z.boolean().optional(),
  is_time_period: z.boolean().optional(),
  is_sensitive: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

// Edit schema with icon-related fields, no column_name or data_type
const editDataSourceColumnSchema = z.object({
  display_name: z.string().min(1, 'Display name is required'),
  column_description: z.string().optional(),
  sort_order: z.number().optional(),
  is_filterable: z.boolean().optional(),
  is_groupable: z.boolean().optional(),
  is_measure: z.boolean().optional(),
  is_dimension: z.boolean().optional(),
  is_date_field: z.boolean().optional(),
  is_measure_type: z.boolean().optional(),
  is_time_period: z.boolean().optional(),
  format_type: z.string().optional(),
  default_aggregation: z.string().optional(),
  is_sensitive: z.boolean().optional(),
  access_level: z.string().optional(),
  example_value: z.string().optional(),
  is_active: z.boolean().optional(),
  display_icon: z.boolean().optional(),
  icon_type: z.enum(['initials', 'first_letter', 'emoji']).optional(),
  icon_color_mode: z.enum(['auto', 'fixed', 'mapped']).optional(),
  icon_color: z.string().optional(),
});

type CreateDataSourceColumnFormData = z.infer<typeof createDataSourceColumnSchema>;
type EditDataSourceColumnFormData = z.infer<typeof editDataSourceColumnSchema>;
type DataSourceColumnFormData = CreateDataSourceColumnFormData | EditDataSourceColumnFormData;

interface DataSourceColumnModalProps {
  mode: 'create' | 'edit';
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  dataSourceId: number;
  column?: DataSourceColumn | null;
}

export default function DataSourceColumnModal({
  mode,
  isOpen,
  onClose,
  onSuccess,
  dataSourceId,
  column,
}: DataSourceColumnModalProps) {
  const createColumnMutation = useCreateDataSourceColumn(dataSourceId);
  const updateColumnMutation = useUpdateDataSourceColumn(dataSourceId, column?.column_id || 0);

  // Transform entity for edit mode
  const transformedEntity = column
    ? {
        ...column,
        icon_type: column.icon_type as 'initials' | 'first_letter' | 'emoji' | undefined,
        icon_color_mode: (column.icon_color_mode as 'auto' | 'fixed' | 'mapped' | undefined) ?? 'auto',
      }
    : null;

  const fields: FieldConfig<DataSourceColumnFormData>[] = [
    {
      type: 'text',
      name: 'column_name' as never,
      label: 'Column Name',
      placeholder: 'e.g., user_id, order_total',
      required: true,
      column: 'left',
      visible: (_formData) => mode === 'create',
    },
    {
      type: 'select',
      name: 'data_type' as never,
      label: 'Data Type',
      required: true,
      column: 'right',
      options: [
        { value: 'text', label: 'Text' },
        { value: 'integer', label: 'Integer' },
        { value: 'decimal', label: 'Decimal' },
        { value: 'boolean', label: 'Boolean' },
        { value: 'date', label: 'Date' },
        { value: 'timestamp', label: 'Timestamp' },
        { value: 'json', label: 'JSON' },
      ],
      visible: (_formData) => mode === 'create',
    },
    {
      type: 'text',
      name: 'display_name' as never,
      label: 'Display Name',
      placeholder: 'e.g., User ID, Order Total',
      required: true,
      column: mode === 'create' ? 'left' : 'full',
    },
    {
      type: 'textarea',
      name: 'column_description' as never,
      label: 'Description',
      placeholder: 'Optional description of what this column contains',
      column: 'full',
      rows: 2,
    },
    {
      type: 'checkbox',
      name: 'is_filterable' as never,
      label: 'Filterable - Can be used in filters',
      column: 'left',
    },
    {
      type: 'checkbox',
      name: 'is_groupable' as never,
      label: 'Groupable - Can be used for grouping',
      column: 'right',
    },
    {
      type: 'checkbox',
      name: 'is_measure' as never,
      label: 'Measure - Numeric value for calculations',
      column: 'left',
    },
    {
      type: 'checkbox',
      name: 'is_dimension' as never,
      label: 'Dimension - Category for grouping',
      column: 'right',
    },
    {
      type: 'checkbox',
      name: 'is_date_field' as never,
      label: 'Date Field - Contains date/time values',
      column: 'left',
    },
    {
      type: 'checkbox',
      name: 'is_measure_type' as never,
      label: 'Measure Type - Contains formatting information (currency, count, etc.)',
      column: 'right',
    },
    {
      type: 'checkbox',
      name: 'is_time_period' as never,
      label: 'Time Period - Contains frequency/period values (Monthly, Weekly, etc.)',
      column: 'left',
    },
    {
      type: 'checkbox',
      name: 'is_sensitive' as never,
      label: 'Sensitive Data - Requires additional permissions',
      column: 'right',
    },
    {
      type: 'checkbox',
      name: 'is_active' as never,
      label: 'Active - Column is available for use',
      column: 'left',
    },
    {
      type: 'checkbox',
      name: 'display_icon' as never,
      label: 'Display Icon - Show colored icon in first column of table charts',
      column: 'full',
      visible: (_formData) => mode === 'edit',
    },
    {
      type: 'select',
      name: 'icon_type' as never,
      label: 'Icon Type',
      column: 'left',
      options: [
        { value: '', label: 'None' },
        { value: 'initials', label: 'Initials (e.g., "MCF" for "Missing Consent Forms")' },
        { value: 'first_letter', label: 'First Letter (e.g., "M" for "Missing Consent Forms")' },
        { value: 'emoji', label: 'Emoji (requires icon mapping configuration)' },
      ],
      visible: (_formData) => mode === 'edit',
    },
    {
      type: 'select',
      name: 'icon_color_mode' as never,
      label: 'Icon Color Mode',
      column: 'right',
      options: [
        { value: 'auto', label: 'Auto - Generate color from text' },
        { value: 'fixed', label: 'Fixed - Use same color for all values' },
        { value: 'mapped', label: 'Mapped - Per-value color mapping (requires icon mapping)' },
      ],
      visible: (_formData) => mode === 'edit',
    },
    {
      type: 'text',
      name: 'icon_color' as never,
      label: 'Fixed Icon Color (if using Fixed mode)',
      placeholder: 'e.g., #8b5cf6, #ef4444, #22c55e',
      helpText: 'HTML hex color codes: #8b5cf6 (violet), #0ea5e9 (sky), #22c55e (green), #ef4444 (red), etc.',
      column: 'full',
      visible: (_formData) => mode === 'edit',
    },
    {
      type: 'number',
      name: 'sort_order' as never,
      label: 'Sort Order',
      placeholder: '0',
      helpText: 'Lower numbers appear first in the column list',
      column: 'full',
      visible: (_formData) => mode === 'edit',
    },
  ];

  const handleSubmit = async (data: DataSourceColumnFormData) => {
    if (mode === 'create') {
      const createData = data as CreateDataSourceColumnFormData;
      await createColumnMutation.mutateAsync({
        ...createData,
        data_source_id: dataSourceId,
      } as never);
    } else if (column) {
      const editData = data as EditDataSourceColumnFormData;
      await updateColumnMutation.mutateAsync(editData as never);
    }
  };

  // Create read-only info display for edit mode
  const infoDisplay = column
    ? `${column.column_name} • ${column.data_type} • ${column.is_active ? 'Active' : 'Inactive'}`
    : undefined;

  return (
    <CrudModal
      mode={mode}
      entity={transformedEntity as never}
      title={mode === 'create' ? 'Add Data Source Column' : 'Edit Data Source Column'}
      resourceName="column"
      isOpen={isOpen}
      onClose={onClose}
      {...(onSuccess && { onSuccess })}
      schema={(mode === 'create' ? createDataSourceColumnSchema : editDataSourceColumnSchema) as never}
      defaultValues={
        {
          column_name: '',
          display_name: '',
          column_description: '',
          data_type: 'text',
          sort_order: 0,
          access_level: 'all',
          is_filterable: false,
          is_groupable: false,
          is_measure: false,
          is_dimension: false,
          is_date_field: false,
          is_measure_type: false,
          is_time_period: false,
          is_sensitive: false,
          is_active: true,
          display_icon: false,
          icon_type: '',
          icon_color_mode: 'auto',
          icon_color: '',
        } as never
      }
      fields={fields}
      onSubmit={handleSubmit}
      size="2xl"
      successMessage={
        mode === 'create' ? 'Column added successfully!' : 'Column updated successfully!'
      }
      {...(mode === 'edit' && infoDisplay && { infoDisplay })}
    />
  );
}
