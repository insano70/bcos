'use client';

import { z } from 'zod';
import {
  type DataSource,
  useCreateDataSource,
  useUpdateDataSource,
} from '@/lib/hooks/use-data-sources';
import CrudModal from './crud-modal';
import type { FieldConfig } from './crud-modal/types';

const dataSourceSchema = z.object({
  data_source_name: z.string().min(1, 'Data source name is required'),
  data_source_description: z.string().optional(),
  schema_name: z.string().min(1, 'Schema name is required'),
  table_name: z.string().min(1, 'Table name is required'),
  database_type: z.string().min(1, 'Database type is required'),
  is_active: z.boolean().optional(),
  requires_auth: z.boolean().optional(),
});

type DataSourceFormData = z.infer<typeof dataSourceSchema>;

interface DataSourceModalProps {
  mode: 'create' | 'edit';
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  dataSource?: DataSource | null;
}

export default function DataSourceModal({
  mode,
  isOpen,
  onClose,
  onSuccess,
  dataSource,
}: DataSourceModalProps) {
  const createDataSource = useCreateDataSource();
  const updateDataSource = useUpdateDataSource(dataSource?.data_source_id || null);

  const fields: FieldConfig<DataSourceFormData>[] = [
    {
      type: 'text',
      name: 'data_source_name',
      label: 'Data Source Name',
      placeholder: 'Enter a descriptive name for the data source',
      required: true,
    },
    {
      type: 'textarea',
      name: 'data_source_description',
      label: 'Description',
      placeholder: 'Optional description of what this data source contains',
      rows: 3,
    },
    {
      type: 'text',
      name: 'schema_name',
      label: 'Schema Name',
      placeholder: 'e.g., ih, public',
      required: true,
      column: 'left',
    },
    {
      type: 'text',
      name: 'table_name',
      label: 'Table Name',
      placeholder: 'e.g., agg_app_measures',
      required: true,
      column: 'right',
    },
    {
      type: 'select',
      name: 'database_type',
      label: 'Database Type',
      required: true,
      options: [
        { value: 'postgresql', label: 'PostgreSQL' },
        { value: 'mysql', label: 'MySQL' },
        { value: 'sqlite', label: 'SQLite' },
      ],
    },
    {
      type: 'checkbox',
      name: 'is_active',
      label: 'Active',
      column: 'left',
    },
    {
      type: 'checkbox',
      name: 'requires_auth',
      label: 'Requires Authentication',
      column: 'right',
    },
  ];

  const handleSubmit = async (data: DataSourceFormData) => {
    const payload = {
      data_source_name: data.data_source_name,
      data_source_description: data.data_source_description?.trim() || undefined,
      table_name: data.table_name,
      schema_name: data.schema_name,
      database_type: data.database_type,
      is_active: data.is_active ?? true,
      requires_auth: data.requires_auth ?? true,
    };

    if (mode === 'create') {
      await createDataSource.mutateAsync(payload);
    } else if (dataSource) {
      await updateDataSource.mutateAsync(payload);
    }
  };

  return (
    <CrudModal
      mode={mode}
      entity={dataSource as never}
      title={mode === 'create' ? 'Add Data Source' : 'Edit Data Source'}
      resourceName="data source"
      isOpen={isOpen}
      onClose={onClose}
      {...(onSuccess && { onSuccess })}
      schema={dataSourceSchema as never}
      defaultValues={{
        data_source_name: '',
        data_source_description: '',
        table_name: '',
        schema_name: '',
        database_type: 'postgresql',
        is_active: true,
        requires_auth: true,
      } as never}
      fields={fields}
      onSubmit={handleSubmit}
      size="2xl"
      successMessage={
        mode === 'create'
          ? 'Data source created successfully!'
          : 'Data source updated successfully!'
      }
    />
  );
}
