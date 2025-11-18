import type {
  DataSourceColumnCreateInput,
  DataSourceColumnQueryInput,
  DataSourceColumnUpdateInput,
  DataSourceCreateInput,
  DataSourceQueryInput,
  DataSourceUpdateInput,
  TableColumnsQueryInput,
} from '@/lib/validations/data-sources';
import { useApiDelete, useApiPost, useApiPut, useApiQuery } from './use-api';

// Re-export types for convenience
export type {
  TableColumnsQueryInput,
  DataSourceColumnCreateInput,
  DataSourceColumnUpdateInput,
  DataSourceColumnQueryInput,
};

export interface DataSource {
  data_source_id: number;
  data_source_name: string;
  data_source_description: string | null;
  table_name: string;
  schema_name: string;
  database_type: string | null;
  connection_config: unknown;
  is_active: boolean | null;
  requires_auth: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  column_count?: number;
  last_tested?: string | null;
}

// Use validation schema types for consistency
export type CreateDataSourceData = DataSourceCreateInput;
export type UpdateDataSourceData = DataSourceUpdateInput;
export type DataSourceQueryOptions = DataSourceQueryInput;

export interface ConnectionTestResult {
  success: boolean;
  error?: string;
  details?: {
    connection_time_ms?: number;
    schema_accessible?: boolean;
    table_accessible?: boolean;
    sample_row_count?: number;
  };
}

export interface DataSourceColumn {
  id: string; // Added for DataTableEnhanced compatibility
  column_id: number;
  data_source_id: number;
  column_name: string;
  display_name: string;
  column_description: string | null;
  data_type: string;

  // Chart functionality flags
  is_filterable: boolean | null;
  is_groupable: boolean | null;
  is_measure: boolean | null;
  is_dimension: boolean | null;
  is_date_field: boolean | null;
  is_measure_type: boolean | null;
  is_time_period: boolean | null;
  is_expansion_dimension: boolean | null;
  expansion_display_name: string | null;

  // Display and formatting
  format_type: string | null;
  sort_order: number | null;
  default_aggregation: string | null;

  // Icon display options
  display_icon: boolean | null;
  icon_type: string | null;
  icon_color_mode: string | null;
  icon_color: string | null;
  icon_mapping: unknown;

  // Security and validation
  is_sensitive: boolean | null;
  access_level: string | null;
  allowed_values: unknown;
  validation_rules: unknown;

  // Metadata
  example_value: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

// Hook for fetching data sources list
export function useDataSources(options: DataSourceQueryOptions = { limit: 1000, offset: 0 }) {
  const queryParams = new URLSearchParams();

  if (options.search) queryParams.append('search', options.search);
  if (options.is_active !== undefined) queryParams.append('is_active', String(options.is_active));
  if (options.database_type) queryParams.append('database_type', options.database_type);
  if (options.schema_name) queryParams.append('schema_name', options.schema_name);
  if (options.limit) queryParams.append('limit', String(options.limit));
  if (options.offset) queryParams.append('offset', String(options.offset));

  const queryString = queryParams.toString();
  const url = `/api/admin/data-sources${queryString ? `?${queryString}` : ''}`;

  return useApiQuery<{
    dataSources: DataSource[];
    pagination: { limit: number; offset: number; total: number };
  }>(
    [
      'data-sources',
      options.search || '',
      String(options.is_active ?? ''),
      options.database_type || '',
      options.schema_name || '',
      options.limit || 1000,
      options.offset || 0,
    ],
    url,
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
    }
  );
}

// Hook for fetching single data source
export function useDataSource(dataSourceId: number | null) {
  const url = dataSourceId ? `/api/admin/data-sources/${dataSourceId}` : '';
  return useApiQuery<{ dataSource: DataSource }>(['data-source', dataSourceId || 'none'], url, {
    enabled: !!dataSourceId,
    staleTime: 5 * 60 * 1000,
  });
}

// Hook for creating data source
export function useCreateDataSource() {
  return useApiPost<DataSource, CreateDataSourceData>('/api/admin/data-sources');
}

// Hook for updating data source
export function useUpdateDataSource(dataSourceId: number | null) {
  return useApiPut<DataSource, UpdateDataSourceData>(
    `/api/admin/data-sources/${dataSourceId || 0}`
  );
}

// Hook for deleting data source
export function useDeleteDataSource() {
  return useApiDelete<{ deleted: boolean }, string>((id) => `/api/admin/data-sources/${id}`);
}

// Hook for testing connection
export function useTestConnection(dataSourceId: number | null) {
  return useApiPost<ConnectionTestResult, Record<string, never>>(
    `/api/admin/data-sources/${dataSourceId || 0}/test`
  );
}

// Hook for fetching table columns
export function useTableColumns(query: TableColumnsQueryInput | null) {
  const queryString = query
    ? new URLSearchParams({
        schema_name: query.schema_name,
        table_name: query.table_name,
        database_type: query.database_type,
      }).toString()
    : '';

  return useApiQuery<{
    columns: Array<{
      column_name: string;
      data_type: string;
      is_nullable: boolean;
      column_default: string | null;
      ordinal_position: number;
    }>;
    metadata: unknown;
  }>(
    query
      ? ['table-columns', query.schema_name, query.table_name, query.database_type]
      : ['table-columns', 'none'],
    query ? `/api/admin/data-sources?${queryString}` : '',
    {
      enabled: !!query,
      staleTime: 5 * 60 * 1000, // 5 minutes
    }
  );
}

// Hook for fetching data source columns
export function useDataSourceColumns(
  dataSourceId: number | null,
  options: Omit<DataSourceColumnQueryInput, 'data_source_id'> = {}
) {
  const queryParams = new URLSearchParams();

  if (options.is_active !== undefined) queryParams.append('is_active', String(options.is_active));
  if (options.limit) queryParams.append('limit', String(options.limit));
  if (options.offset) queryParams.append('offset', String(options.offset));

  const queryString = queryParams.toString();
  const url = dataSourceId
    ? `/api/admin/data-sources/${dataSourceId}/columns${queryString ? `?${queryString}` : ''}`
    : '';

  return useApiQuery<{ columns: DataSourceColumn[]; pagination: unknown; metadata: unknown }>(
    dataSourceId
      ? [
          'data-source-columns',
          dataSourceId,
          String(options.is_active ?? 'all'),
          options.limit || 1000,
          options.offset || 0,
        ]
      : ['data-source-columns', 'none'],
    url,
    {
      enabled: !!dataSourceId,
      staleTime: 2 * 60 * 1000, // 2 minutes
    }
  );
}

// Hook for fetching single data source column
export function useDataSourceColumn(dataSourceId: number | null, columnId: number | null) {
  const url =
    dataSourceId && columnId ? `/api/admin/data-sources/${dataSourceId}/columns/${columnId}` : '';
  return useApiQuery<{ column: DataSourceColumn }>(
    columnId ? ['data-source-column', columnId] : ['data-source-column', 'none'],
    url,
    {
      enabled: !!(dataSourceId && columnId),
      staleTime: 2 * 60 * 1000, // 2 minutes
    }
  );
}

// Hook for creating data source column
export function useCreateDataSourceColumn(dataSourceId: number) {
  return useApiPost<DataSourceColumn, DataSourceColumnCreateInput>(
    `/api/admin/data-sources/${dataSourceId}/columns`
  );
}

// Hook for updating data source column
export function useUpdateDataSourceColumn(dataSourceId: number, columnId: number) {
  return useApiPut<DataSourceColumn, DataSourceColumnUpdateInput>(
    `/api/admin/data-sources/${dataSourceId}/columns/${columnId}`
  );
}

// Hook for deleting data source column
export function useDeleteDataSourceColumn(dataSourceId: number, columnId: number) {
  return useApiDelete<{ deleted: boolean }, string>(
    `/api/admin/data-sources/${dataSourceId}/columns/${columnId}`
  );
}

// Hook for introspecting data source columns
export function useIntrospectDataSource(dataSourceId: number) {
  return useApiPost<
    {
      created: number;
      columns: DataSourceColumn[];
    },
    Record<string, never>
  >(`/api/admin/data-sources/${dataSourceId}/introspect`);
}
