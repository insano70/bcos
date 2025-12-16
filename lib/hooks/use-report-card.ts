/**
 * Report Card Hooks
 *
 * React Query hooks for report card API operations.
 * All hooks use organization-based queries (not practice UID).
 */

import { useApiQuery, useApiPost, useApiPut, useApiDelete } from './use-api';
import type {
  ReportCard,
  PeerComparison,
  MeasureConfig,
  MeasureCreateInput,
  MeasureUpdateInput,
  GenerationResult,
  PreviousMonthSummary,
  GradeHistoryEntry,
  AnnualReview,
  PracticeTrend,
  EngagementMetric,
} from '@/lib/types/report-card';
import type { SizeBucket } from '@/lib/constants/report-card';

// =============================================================================
// Report Card Queries (by Organization)
// =============================================================================

/**
 * Response type for useReportCardByOrg hook
 */
export interface ReportCardByOrgResponse {
  reportCard: ReportCard;
  previousMonth: PreviousMonthSummary | null;
  availableMonths: string[];
  gradeHistory: GradeHistoryEntry[];
  /** Trend data for all periods (3, 6, and 9 month comparisons) */
  trends: PracticeTrend[];
  /** Engagement metric showing app access frequency vs benchmark */
  engagementMetric: EngagementMetric;
}

/**
 * Hook for fetching an organization's report card
 * This is the PRIMARY hook for UI - users select by organization, not practice.
 * Includes previous month summary for comparison display and grade history.
 *
 * @param organizationId - Organization ID (UUID) to fetch report card for
 * @param month - Optional month in YYYY-MM-DD format to fetch specific month's report card
 */
export function useReportCardByOrg(organizationId: string | undefined, month?: string) {
  const queryParams = month ? `?month=${month}` : '';
  const url = organizationId ? `/api/admin/report-card/org/${organizationId}${queryParams}` : '';

  return useApiQuery<ReportCardByOrgResponse>(
    organizationId
      ? ['report-card-by-org', organizationId, month || 'latest']
      : ['report-card-by-org', 'none'],
    url,
    {
      enabled: !!organizationId,
      staleTime: 5 * 60 * 1000, // 5 minutes
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
 * Hook for fetching annual review data by organization
 * Returns year-over-year comparison, trends, and forecasts.
 */
export function useAnnualReviewByOrg(organizationId: string | undefined) {
  const url = organizationId ? `/api/admin/report-card/org/${organizationId}/annual-review` : '';

  return useApiQuery<{ review: AnnualReview }>(
    organizationId
      ? ['report-card-annual-review-by-org', organizationId]
      : ['report-card-annual-review-by-org', 'none'],
    url,
    {
      enabled: !!organizationId,
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
