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

// Analytics hooks
export function useFeedbackAnalytics(dateRange?: { start: string; end: string }) {
  const searchParams = new URLSearchParams();
  if (dateRange?.start) searchParams.append('start', dateRange.start);
  if (dateRange?.end) searchParams.append('end', dateRange.end);

  const paramsKey = dateRange ? JSON.stringify(dateRange) : 'all';

  return useApiQuery<{
    overview: {
      totalFeedback: number;
      pendingFeedback: number;
      resolvedFeedback: number;
      criticalIssues: number;
      averageResolutionTime: number;
      resolutionRate: number;
    };
    trends: {
      feedbackByType: Record<string, number>;
      feedbackByCategory: Record<string, number>;
      feedbackBySeverity: Record<string, number>;
      weekOverWeekChange: number;
      monthOverMonthChange: number;
    };
    topIssues: Array<{
      issue: string;
      count: number;
      severity: string;
      affectedTables: string[];
      firstSeen: Date;
      lastSeen: Date;
      resolved: number;
      pending: number;
    }>;
    resolutionMetrics: {
      averageTimeToResolve: number;
      resolutionsByStatus: Record<string, number>;
      resolutionsByType: Record<string, number>;
      fastestResolutions: Array<{ feedbackId: string; hours: number }>;
      slowestResolutions: Array<{ feedbackId: string; hours: number }>;
    };
    impactMetrics: {
      queriesImproved: number;
      metadataUpdates: number;
      instructionsCreated: number;
      relationshipsAdded: number;
      editRateReduction: number;
      userSatisfactionImprovement: number;
    };
    timeSeriesData: Array<{
      date: string;
      feedbackCount: number;
      resolvedCount: number;
      criticalCount: number;
      editRate: number;
    }>;
  }>(
    ['data-explorer', 'analytics', 'feedback', paramsKey],
    `/api/data/explorer/analytics/feedback?${searchParams.toString()}`,
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
    }
  );
}

export function useLearningMetrics() {
  return useApiQuery<{
    totalQueries: number;
    editedQueries: number;
    editRate: number;
    editRateTrend: Array<{ period: string; rate: number }>;
    feedbackVolumeTrend: Array<{ period: string; count: number }>;
    improvementScore: number;
  }>(
    ['data-explorer', 'analytics', 'learning-metrics'],
    '/api/data/explorer/analytics/learning-metrics',
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
    }
  );
}

export function useEditStatistics() {
  return useApiQuery<{
    overview: {
      totalQueries: number;
      editedQueries: number;
      editRate: number;
      averageEditCount: number;
    };
    topEditedQueries: Array<{
      query_history_id: string;
      natural_language_query: string;
      edit_count: number;
      last_edited: Date;
    }>;
  }>(
    ['data-explorer', 'statistics', 'edits'],
    '/api/data/explorer/statistics/edits',
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
    }
  );
}

// Suggestion hooks
export function usePendingSuggestions() {
  return useApiQuery<Array<{
    suggestion_id: string;
    feedback_id: string | null;
    suggestion_type: string;
    target_type: string;
    target_id: string | null;
    suggested_change: unknown;
    confidence_score: string | null;
    status: string;
    created_at: Date;
  }>>(['data-explorer', 'suggestions', 'pending'], '/api/data/explorer/suggestions/pending', {
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

export function useApproveSuggestion() {
  return useApiMutation<
    { suggestion_id: string; status: string },
    { suggestionId: string }
  >(({ suggestionId }) =>
    apiClient.post(`/api/data/explorer/suggestions/${suggestionId}/approve`, {})
  );
}

export function useRejectSuggestion() {
  return useApiMutation<
    { suggestion_id: string; status: string },
    { suggestionId: string }
  >(({ suggestionId }) =>
    apiClient.post(`/api/data/explorer/suggestions/${suggestionId}/reject`, {})
  );
}

export function useSuggestionStatistics() {
  return useApiQuery<{
    totalSuggestions: number;
    pendingSuggestions: number;
    approvedSuggestions: number;
    rejectedSuggestions: number;
    autoAppliedSuggestions: number;
    averageConfidence: number;
    byType: Record<string, number>;
  }>(['data-explorer', 'suggestions', 'statistics'], '/api/data/explorer/suggestions/statistics', {
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Notification hooks
export function useAlerts() {
  return useApiQuery<Array<{
    type: string;
    severity: string;
    title: string;
    description: string;
    feedbackIds: string[];
    affectedTables: string[];
    count: number;
    createdAt: Date;
  }>>(['data-explorer', 'notifications', 'alerts'], '/api/data/explorer/notifications/alerts', {
    staleTime: 1 * 60 * 1000, // 1 minute
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });
}

export function useDailyDigest() {
  return useApiQuery<{
    newFeedback: number;
    resolvedFeedback: number;
    criticalIssues: number;
    topIssues: Array<{ issue: string; count: number }>;
    alerts: Array<{
      type: string;
      severity: string;
      title: string;
      description: string;
      count: number;
    }>;
  }>(['data-explorer', 'notifications', 'digest'], '/api/data/explorer/notifications/digest', {
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

// Test case hooks
export function useTestCases() {
  return useApiQuery<Array<{
    testCaseId: string;
    name: string;
    description: string;
    naturalLanguageQuery: string;
    expectedSQL: string;
    category: string;
    priority: string;
    tags: string[];
    createdFrom: string;
    createdAt: Date;
  }>>(['data-explorer', 'test-cases'], '/api/data/explorer/test-cases', {
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useRunTestCase() {
  return useApiMutation<
    {
      passed: boolean;
      generatedSQL: string;
      expectedSQL: string;
      differences: string[];
    },
    { testCaseId: string }
  >(({ testCaseId }) =>
    apiClient.post(`/api/data/explorer/test-cases/${testCaseId}/run`, {})
  );
}

export function useGenerateTestCases() {
  return useApiMutation<
    Array<{
      testCaseId: string;
      name: string;
      priority: string;
    }>,
    { limit?: number }
  >(({ limit = 50 }) =>
    apiClient.post('/api/data/explorer/test-cases/generate', { limit })
  );
}

