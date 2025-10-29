import { useApiQuery, useApiMutation } from './use-api';
import { apiClient } from '@/lib/api/client';
import type {
  GenerateSQLParams,
  GenerateSQLResult,
  ExecuteQueryParams,
  ExecuteQueryResult,
  TableMetadata,
  QueryHistory,
} from '@/lib/types/data-explorer';

export function useGenerateSQL() {
  return useApiMutation<GenerateSQLResult, GenerateSQLParams>(
    (params) => apiClient.post<GenerateSQLResult>('/api/data/explorer/generate-sql', params)
  );
}

export function useExecuteQuery() {
  return useApiMutation<ExecuteQueryResult, ExecuteQueryParams>(
    (params) => apiClient.post<ExecuteQueryResult>('/api/data/explorer/execute-query', params)
  );
}

export function useTableMetadata(params?: {
  schema_name?: string;
  tier?: number;
  is_active?: boolean;
  search?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.schema_name) searchParams.append('schema_name', params.schema_name);
  if (params?.tier !== undefined) searchParams.append('tier', String(params.tier));
  if (params?.is_active !== undefined) searchParams.append('is_active', String(params.is_active));
  if (params?.search) searchParams.append('search', params.search);

  return useApiQuery<TableMetadata[]>(
    ['data-explorer', 'metadata', 'tables', JSON.stringify(params)],
    `/api/data/explorer/metadata/tables?${searchParams.toString()}`,
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
    }
  );
}

export function useQueryHistory(params?: { limit?: number; offset?: number; status?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.append('limit', String(params.limit));
  if (params?.offset) searchParams.append('offset', String(params.offset));
  if (params?.status) searchParams.append('status', params.status);

  return useApiQuery<QueryHistory[]>(
    ['data-explorer', 'history', JSON.stringify(params)],
    `/api/data/explorer/history/list?${searchParams.toString()}`,
    {
      staleTime: 1 * 60 * 1000, // 1 minute
    }
  );
}

export function useUpdateTableMetadata() {
  return useApiMutation<TableMetadata, { id: string; data: Partial<TableMetadata> }>(
    ({ id, data }) => apiClient.put<TableMetadata>(`/api/data/explorer/metadata/tables/${id}`, data)
  );
}

