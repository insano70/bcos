'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/components/auth/rbac-auth-provider';
import { ChartErrorBoundary } from '@/components/charts/chart-error-boundary';
import {
  useReportCard,
  useTrends,
  usePeerComparison,
} from '@/lib/hooks/use-report-card';
import { useOrganizations } from '@/lib/hooks/use-organizations';
import HierarchySelect from '@/components/hierarchy-select';
import type { TrendPeriod, SizeBucket } from '@/lib/constants/report-card';
import {
  OverallScoreCard,
  MeasureBreakdown,
  TrendChart,
  PeerComparisonPanel,
  InsightsPanel,
} from '@/components/report-card';
import { getReportCardMonth } from '@/lib/utils/format-value';
import { FileText, RefreshCcw, Building2 } from 'lucide-react';

/**
 * Report Card View Component
 *
 * Displays practice performance metrics, trends, and peer comparisons.
 */
export default function ReportCardView() {
  const { userContext, isLoading: authLoading } = useAuth();
  const [selectedPracticeUid, setSelectedPracticeUid] = useState<number | undefined>(undefined);
  const [selectedOrgId, setSelectedOrgId] = useState<string | undefined>(undefined);
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('3_month');
  const [selectedPeerBucket, setSelectedPeerBucket] = useState<SizeBucket | undefined>(undefined);

  // Get the report card month (last full month)
  const reportCardMonthInfo = useMemo(() => getReportCardMonth(), []);
  const reportCardMonth = reportCardMonthInfo.monthYear;

  // Check if user has all-access permission (super user)
  const canViewAll = useMemo(() => {
    if (!userContext?.all_permissions) return false;
    return userContext.all_permissions.some(
      (p) => p.name === 'analytics:read:all'
    );
  }, [userContext]);

  // Fetch organizations for super users
  const { data: allOrganizations = [], isLoading: loadingOrgs } = useOrganizations();

  // Get practice UIDs from user's organizations (for regular users)
  // or from selected organization (for super users)
  const practiceUids = useMemo(() => {
    if (canViewAll && selectedOrgId) {
      // Super user with selected org - get practices from that org
      const org = allOrganizations.find((o) => o.id === selectedOrgId);
      return org?.practice_uids || [];
    }
    
    if (canViewAll && !selectedOrgId) {
      // Super user without selected org - show all practices from all orgs
      const uids: number[] = [];
      for (const org of allOrganizations) {
        if (org.practice_uids) {
          uids.push(...org.practice_uids);
        }
      }
      return Array.from(new Set(uids));
    }

    // Regular user - get from their organizations
    if (!userContext?.organizations) return [];
    const uids: number[] = [];
    for (const org of userContext.organizations) {
      if (org.practice_uids) {
        uids.push(...org.practice_uids);
      }
    }
    return Array.from(new Set(uids));
  }, [userContext, canViewAll, selectedOrgId, allOrganizations]);

  // Set initial practice UID when available
  useEffect(() => {
    if (practiceUids.length > 0 && !selectedPracticeUid) {
      setSelectedPracticeUid(practiceUids[0]);
    }
  }, [practiceUids, selectedPracticeUid]);

  // Reset practice selection when org changes
  useEffect(() => {
    if (canViewAll && selectedOrgId) {
      const org = allOrganizations.find((o) => o.id === selectedOrgId);
      const orgPractices = org?.practice_uids || [];
      if (orgPractices.length > 0) {
        setSelectedPracticeUid(orgPractices[0]);
      } else {
        setSelectedPracticeUid(undefined);
      }
    }
  }, [selectedOrgId, canViewAll, allOrganizations]);

  // Data hooks
  const {
    data: reportCardData,
    isLoading: isLoadingReportCard,
    error: reportCardError,
    refetch: refetchReportCard,
  } = useReportCard(selectedPracticeUid);

  const { data: trendsData, isLoading: isLoadingTrends } = useTrends(
    selectedPracticeUid,
    trendPeriod
  );

  // Default peer bucket to practice's bucket, allow override
  const practiceBucket = reportCardData?.reportCard?.size_bucket;
  const effectivePeerBucket = selectedPeerBucket ?? practiceBucket;

  const { data: peerData, isLoading: isLoadingPeer } = usePeerComparison(
    effectivePeerBucket
  );

  const reportCard = reportCardData?.reportCard;
  const trends = trendsData?.trends || [];
  const peerComparison = peerData?.comparison;

  const isLoading = authLoading || isLoadingReportCard || isLoadingTrends || isLoadingPeer;

  // Reset peer bucket selection when practice changes (so it defaults to new practice's bucket)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset on practice change only
  useEffect(() => {
    setSelectedPeerBucket(undefined);
  }, [selectedPracticeUid]);

  // Render organization selector for super users
  const renderFilters = () => {
    if (!canViewAll) return null;

    // Get selected org name for display
    const selectedOrgName = selectedOrgId 
      ? allOrganizations.find((o) => o.id === selectedOrgId)?.name 
      : null;

    return (
      <div className="flex flex-wrap items-center gap-4 mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <Building2 className="w-4 h-4" />
          <span className="font-medium">Organization:</span>
        </div>
        
        {/* Organization selector */}
        <div className="w-72">
          <HierarchySelect
            items={allOrganizations}
            value={selectedOrgId}
            onChange={(id) => setSelectedOrgId(id as string | undefined)}
            idField="id"
            nameField="name"
            parentField="parent_organization_id"
            activeField="is_active"
            placeholder="Select an Organization"
            disabled={loadingOrgs}
            showSearch
            allowClear
            rootLabel="All Organizations"
          />
        </div>

        {/* Show selected org info */}
        {selectedOrgName && practiceUids.length > 0 && (
          <span className="text-sm text-slate-500 dark:text-slate-400">
            ({practiceUids.length} practice{practiceUids.length !== 1 ? 's' : ''})
          </span>
        )}
      </div>
    );
  };

  // No practice selected state - show different message for super users
  if (!authLoading && !loadingOrgs && !selectedPracticeUid) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-7xl mx-auto">
        <div className="sm:flex sm:justify-between sm:items-center mb-8">
          <div className="mb-4 sm:mb-0">
            <h1 className="text-2xl md:text-3xl text-slate-800 dark:text-slate-100 font-bold">
              Practice Report Card
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              View your practice performance metrics and peer comparisons
            </p>
          </div>
        </div>

        {renderFilters()}

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
          <div className="text-center py-12">
            <div className="p-4 rounded-full bg-slate-100 dark:bg-slate-800 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
              <FileText className="w-10 h-10 text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-2">
              No Practice Selected
            </h3>
            <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              {canViewAll
                ? 'Select an organization above to view their report card.'
                : 'Your account is not associated with a practice. Please contact your administrator to be assigned to a practice.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading && !reportCard) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center py-24">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500 mb-4" />
          <span className="text-slate-600 dark:text-slate-400">Loading your report card...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (reportCardError) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-7xl mx-auto">
        <div className="bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 p-6 rounded-2xl">
          <h3 className="font-semibold mb-2">Failed to load report card</h3>
          <p className="text-sm mb-4">
            There was an error loading your report card. This may be because no report card
            has been generated for your practice yet.
          </p>
          <button
            onClick={() => refetchReportCard()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-rose-100 dark:bg-rose-900/30 rounded-lg hover:bg-rose-200 dark:hover:bg-rose-900/50 transition-colors"
          >
            <RefreshCcw className="w-4 h-4" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // No report card data
  if (!reportCard) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-7xl mx-auto">
        <div className="sm:flex sm:justify-between sm:items-center mb-8">
          <div className="mb-4 sm:mb-0">
            <h1 className="text-2xl md:text-3xl text-slate-800 dark:text-slate-100 font-bold">
              Practice Report Card
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              View your practice performance metrics and peer comparisons
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
          <div className="text-center py-12">
            <div className="p-4 rounded-full bg-amber-100 dark:bg-amber-900/30 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
              <FileText className="w-10 h-10 text-amber-500" />
            </div>
            <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-2">
              Report Card Not Available
            </h3>
            <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Your practice report card has not been generated yet. Report cards are
              generated periodically based on your practice data.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Extract practice values and scores for peer comparison
  // Values = actual raw values (e.g., $150,000 in charges)
  // Scores = normalized 0-100 scores for percentile positioning
  const practiceValues: Record<string, number> = {};
  const practiceScores: Record<string, number> = {};
  if (reportCard.measure_scores) {
    for (const [measureName, scoreData] of Object.entries(reportCard.measure_scores)) {
      practiceValues[measureName] = scoreData.value;
      practiceScores[measureName] = scoreData.score;
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-7xl mx-auto">
      {/* Header */}
      <div className="sm:flex sm:justify-between sm:items-center mb-8">
        <div className="mb-4 sm:mb-0">
          <h1 className="text-2xl md:text-3xl text-slate-800 dark:text-slate-100 font-bold">
            {reportCardMonth} Report Card
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            How your practice performed in {reportCardMonthInfo.monthName}
          </p>
        </div>
        <div className="text-sm text-slate-500 dark:text-slate-400">
          Generated:{' '}
          {new Date(reportCard.generated_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>

      {/* Filters for super users */}
      {renderFilters()}

      {/* Main grid layout - wrapped in error boundary for resilience */}
      <ChartErrorBoundary chartName="Report Card">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Overall Score Card - Full width on mobile, 5 cols on large */}
          <div className="lg:col-span-5">
            <OverallScoreCard
              score={reportCard.overall_score}
              sizeBucket={reportCard.size_bucket}
              percentileRank={reportCard.percentile_rank}
              reportCardMonth={reportCardMonth}
            />
          </div>

          {/* Insights Panel - Full width on mobile, 7 cols on large */}
          <div className="lg:col-span-7">
            <InsightsPanel insights={reportCard.insights} />
          </div>

          {/* Measure Breakdown - Full width on mobile, 6 cols on large */}
          <div className="lg:col-span-6">
            <MeasureBreakdown measureScores={reportCard.measure_scores} />
          </div>

          {/* Trend Chart - Full width on mobile, 6 cols on large */}
          <div className="lg:col-span-6">
            <ChartErrorBoundary chartName="Trend Chart">
              <TrendChart
                trends={trends}
                selectedPeriod={trendPeriod}
                onPeriodChange={setTrendPeriod}
              />
            </ChartErrorBoundary>
          </div>

          {/* Peer Comparison - Full width */}
          {peerComparison && (
            <div className="lg:col-span-12">
              <PeerComparisonPanel
                comparison={peerComparison}
                practiceValues={practiceValues}
                practiceScores={practiceScores}
                measureScores={reportCard.measure_scores}
                practiceBucket={reportCard.size_bucket}
                selectedBucket={effectivePeerBucket}
                onBucketChange={setSelectedPeerBucket}
                isLoadingPeer={isLoadingPeer}
              />
            </div>
          )}
        </div>
      </ChartErrorBoundary>
    </div>
  );
}
