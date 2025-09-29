import { useApiQuery, useApiPost, useApiPut, useApiDelete } from './use-api';
import type { DataSourceCreateInput, DataSourceUpdateInput, DataSourceQueryInput } from '@/lib/validations/data-sources';

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
  connection_status?: 'connected' | 'error' | 'untested';
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

// Hook for fetching data sources list
export function useDataSources(options: DataSourceQueryOptions = { limit: 50, offset: 0 }) {
  const queryParams = new URLSearchParams();
  
  if (options.search) queryParams.append('search', options.search);
  if (options.is_active !== undefined) queryParams.append('is_active', String(options.is_active));
  if (options.database_type) queryParams.append('database_type', options.database_type);
  if (options.schema_name) queryParams.append('schema_name', options.schema_name);
  if (options.limit) queryParams.append('limit', String(options.limit));
  if (options.offset) queryParams.append('offset', String(options.offset));

  const queryString = queryParams.toString();
  const url = `/api/admin/data-sources${queryString ? `?${queryString}` : ''}`;

  return useApiQuery<{ dataSources: DataSource[]; pagination: { limit: number; offset: number; total: number } }>(
    ['data-sources', options.search || '', String(options.is_active ?? ''), options.database_type || '', options.schema_name || '', options.limit || 50, options.offset || 0],
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
  return useApiQuery<{ dataSource: DataSource }>(
    ['data-source', dataSourceId || 'none'],
    url,
    {
      enabled: !!dataSourceId,
      staleTime: 5 * 60 * 1000,
    }
  );
}

// Hook for creating data source
export function useCreateDataSource() {
  return useApiPost<DataSource, CreateDataSourceData>('/api/admin/data-sources');
}

// Hook for updating data source
export function useUpdateDataSource(dataSourceId: number) {
  return useApiPut<DataSource, UpdateDataSourceData>(`/api/admin/data-sources/${dataSourceId}`);
}

// Hook for deleting data source
export function useDeleteDataSource() {
  return useApiDelete<{ deleted: boolean }, string>((id) => `/api/admin/data-sources/${id}`);
}

// Hook for testing connection
export function useTestConnection(dataSourceId: number) {
  return useApiPost<ConnectionTestResult, Record<string, never>>(`/api/admin/data-sources/${dataSourceId}/test`);
}
