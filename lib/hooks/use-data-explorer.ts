import { useApiQuery, useApiMutation } from './use-api';
import { apiClient } from '@/lib/api/client';
import type {
  GenerateSQLParams,
  GenerateSQLResult,
  ExecuteQueryParams,
  ExecuteQueryResult,
  TableMetadata,
  QueryHistory,
  SchemaInstruction,
  QueryFeedback,
  SubmitFeedbackParams,
  ResolveFeedbackParams,
  FeedbackQueryOptions,
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
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.schema_name) searchParams.append('schema_name', params.schema_name);
  if (params?.tier !== undefined) searchParams.append('tier', String(params.tier));
  if (params?.is_active !== undefined) searchParams.append('is_active', String(params.is_active));
  if (params?.search) searchParams.append('search', params.search);
  if (params?.limit !== undefined) searchParams.append('limit', String(params.limit));

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

export function useSchemaInstructions() {
  return useApiQuery<SchemaInstruction[]>(
    ['data-explorer', 'schema-instructions'],
    '/api/data/explorer/schema-instructions',
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000,
    }
  );
}

// Column statistics analysis hooks
interface AnalyzeColumnResult {
  column_metadata_id: string;
  status: 'completed' | 'failed' | 'skipped';
  duration_ms: number;
  error?: string;
}

interface AnalyzeTableColumnsResult {
  analyzed: number;
  skipped: number;
  failed: number;
  duration_ms: number;
}

export function useAnalyzeColumn() {
  return useApiMutation<AnalyzeColumnResult, { columnId: string; force?: boolean }>(
    ({ columnId, force = false }) =>
      apiClient.post<AnalyzeColumnResult>(
        `/api/data/explorer/metadata/columns/${columnId}/analyze`,
        { force }
      )
  );
}

export function useAnalyzeTableColumns() {
  return useApiMutation<AnalyzeTableColumnsResult, { tableId: string; force?: boolean; resume?: boolean }>(
    ({ tableId, force = false, resume = true }) =>
      apiClient.post<AnalyzeTableColumnsResult>(
        `/api/data/explorer/metadata/tables/${tableId}/analyze-columns`,
        { force, resume }
      )
  );
}

export function useAnalyzeSchema() {
  return useApiMutation<
    AnalyzeTableColumnsResult,
    { tiers?: Array<1 | 2 | 3>; limit?: number; force?: boolean; resume?: boolean }
  >(
    ({ tiers, limit, force = false, resume = true }) =>
      apiClient.post<AnalyzeTableColumnsResult>(
        '/api/data/explorer/metadata/analyze-schema',
        { tiers, limit, force, resume }
      )
  );
}

// Feedback hooks
export function useSubmitFeedback() {
  return useApiMutation<QueryFeedback, SubmitFeedbackParams>(
    (params) =>
      apiClient.post<QueryFeedback>('/api/data/explorer/feedback', params)
  );
}

export function usePendingFeedback(params?: FeedbackQueryOptions) {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.append('status', params.status);
  if (params?.severity) searchParams.append('severity', params.severity);
  if (params?.feedback_type) searchParams.append('feedback_type', params.feedback_type);
  if (params?.limit) searchParams.append('limit', String(params.limit));
  if (params?.offset) searchParams.append('offset', String(params.offset));

  const paramsKey = params ? JSON.stringify(params) : 'all';

  return useApiQuery<QueryFeedback[]>(
    ['data-explorer', 'feedback', 'pending', paramsKey],
    `/api/data/explorer/feedback/pending?${searchParams.toString()}`,
    {
      staleTime: 1 * 60 * 1000, // 1 minute
    }
  );
}

export function useResolveFeedback() {
  return useApiMutation<QueryFeedback, { feedbackId: string; data: ResolveFeedbackParams }>(
    ({ feedbackId, data }) =>
      apiClient.put<QueryFeedback>(
        `/api/data/explorer/feedback/${feedbackId}/resolve`,
        data
      )
  );
}

