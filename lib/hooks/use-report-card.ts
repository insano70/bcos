/**
 * Report Card Hooks
 *
 * React Query hooks for report card API operations.
 */

import { useApiQuery, useApiPost, useApiPut, useApiDelete } from './use-api';
import type {
  ReportCard,
  PracticeTrend,
  PeerComparison,
  LocationComparison,
  MeasureConfig,
  MeasureCreateInput,
  MeasureUpdateInput,
  GenerationResult,
  PreviousMonthSummary,
  GradeHistoryEntry,
  AnnualReview,
} from '@/lib/types/report-card';
import type { TrendPeriod, SizeBucket } from '@/lib/constants/report-card';

// =============================================================================
// Report Card Queries
// =============================================================================

/**
 * Hook for fetching a practice's report card
 * Includes previous month summary for comparison display
 * 
 * @param practiceUid - Practice UID to fetch report card for
 * @param month - Optional month in YYYY-MM-DD format to fetch specific month's report card
 */
export function useReportCard(practiceUid: number | undefined, month?: string) {
  const queryParams = month ? `?month=${month}` : '';
  const url = practiceUid ? `/api/admin/report-card/${practiceUid}${queryParams}` : '';

  return useApiQuery<{
    reportCard: ReportCard;
    previousMonth: PreviousMonthSummary | null;
    availableMonths: string[];
  }>(
    practiceUid ? ['report-card', practiceUid, month || 'latest'] : ['report-card', 'none'],
    url,
    {
      enabled: !!practiceUid,
      staleTime: 5 * 60 * 1000, // 5 minutes
    }
  );
}

/**
 * Hook for fetching practice trends
 */
export function useTrends(practiceUid: number | undefined, period?: TrendPeriod) {
  const queryParams = period ? `?period=${period}` : '';
  const url = practiceUid ? `/api/admin/report-card/${practiceUid}/trends${queryParams}` : '';

  return useApiQuery<{ trends: PracticeTrend[] }>(
    practiceUid
      ? ['report-card-trends', practiceUid, period || 'all']
      : ['report-card-trends', 'none'],
    url,
    {
      enabled: !!practiceUid,
      staleTime: 5 * 60 * 1000,
    }
  );
}

/**
 * Hook for fetching location comparison for a practice
 */
export function useLocationComparison(practiceUid: number | undefined, measureName?: string) {
  const queryParams = measureName ? `?measure=${encodeURIComponent(measureName)}` : '';
  const url = practiceUid ? `/api/admin/report-card/${practiceUid}/locations${queryParams}` : '';

  return useApiQuery<{ comparison: LocationComparison }>(
    practiceUid
      ? ['report-card-locations', practiceUid, measureName || 'all']
      : ['report-card-locations', 'none'],
    url,
    {
      enabled: !!practiceUid,
      staleTime: 5 * 60 * 1000,
    }
  );
}

/**
 * Hook for fetching peer comparison statistics
 */
export function usePeerComparison(sizeBucket?: SizeBucket) {
  const queryParams = sizeBucket ? `?bucket=${sizeBucket}` : '';
  const url = `/api/admin/report-card/peer-comparison${queryParams}`;

  return useApiQuery<{ comparison: PeerComparison }>(
    ['report-card-peer-comparison', sizeBucket || 'default'],
    url,
    {
      staleTime: 2 * 60 * 1000, // 2 minutes - peer stats can change when buckets are recalculated
    }
  );
}

/**
 * Hook for fetching grade history (last N months of report cards)
 */
export function useGradeHistory(practiceUid: number | undefined, limit: number = 12) {
  const queryParams = limit !== 12 ? `?limit=${limit}` : '';
  const url = practiceUid ? `/api/admin/report-card/${practiceUid}/history${queryParams}` : '';

  return useApiQuery<{ history: GradeHistoryEntry[] }>(
    practiceUid
      ? ['report-card-history', practiceUid, limit]
      : ['report-card-history', 'none'],
    url,
    {
      enabled: !!practiceUid,
      staleTime: 5 * 60 * 1000, // 5 minutes
    }
  );
}

/**
 * Hook for fetching annual review data
 * Returns year-over-year comparison, trends, and forecasts
 */
export function useAnnualReview(practiceUid: number | undefined) {
  const url = practiceUid ? `/api/admin/report-card/${practiceUid}/annual-review` : '';

  return useApiQuery<{ review: AnnualReview }>(
    practiceUid
      ? ['report-card-annual-review', practiceUid]
      : ['report-card-annual-review', 'none'],
    url,
    {
      enabled: !!practiceUid,
      staleTime: 10 * 60 * 1000, // 10 minutes (annual data changes less frequently)
    }
  );
}

// =============================================================================
// Measure Configuration Queries
// =============================================================================

/**
 * Discovered measure combination from analytics database
 */
export interface MeasureCombination {
  measure: string;
  entity_name: string | null;
  entity_type: string | null;
  row_count: number;
}

/**
 * Hook for discovering available measure combinations from analytics DB
 * Used in admin UI to help configure measure filter criteria
 */
export function useDiscoverMeasures() {
  const url = '/api/admin/report-card/measures/discover';

  return useApiQuery<{
    combinations: MeasureCombination[];
    filterable_columns: string[];
    source_table: string;
  }>(['report-card-discover-measures'], url, {
    staleTime: 30 * 60 * 1000, // 30 minutes (analytics schema doesn't change often)
  });
}

/**
 * Hook for fetching all measure configurations
 */
export function useMeasures(activeOnly: boolean = true) {
  const queryParams = activeOnly ? '' : '?is_active=false';
  const url = `/api/admin/report-card/measures${queryParams}`;

  return useApiQuery<{ measures: MeasureConfig[] }>(
    ['report-card-measures', activeOnly ? 'active' : 'all'],
    url,
    {
      staleTime: 5 * 60 * 1000,
    }
  );
}

/**
 * Hook for creating a new measure
 */
export function useCreateMeasure() {
  return useApiPost<{ measure: MeasureConfig }, MeasureCreateInput>(
    '/api/admin/report-card/measures'
  );
}

/**
 * Hook for updating a measure
 */
export function useUpdateMeasure(measureId: number | undefined) {
  return useApiPut<{ measure: MeasureConfig }, MeasureUpdateInput>(
    measureId ? `/api/admin/report-card/measures/${measureId}` : ''
  );
}

/**
 * Hook for deleting a measure
 */
export function useDeleteMeasure() {
  return useApiDelete<{ success: boolean }, number>(
    (id) => `/api/admin/report-card/measures/${id}`
  );
}

// =============================================================================
// Generation Mutation
// =============================================================================

/**
 * Hook for triggering report card generation
 * 
 * @param reset - When true, clears all report card data before regenerating
 * @param force - When true, forces regeneration even if data exists
 */
export function useGenerateReportCards() {
  return useApiPost<
    {
      success: boolean;
      summary: {
        statisticsCollected: number;
        trendsCalculated: number;
        sizingAssigned: number;
        cardsGenerated: number;
        errors: number;
        duration: number;
      };
      errors: GenerationResult['errors'];
    },
    { practiceUid?: number; force?: boolean; reset?: boolean }
  >('/api/admin/report-card/generate');
}
