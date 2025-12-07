'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/components/auth/rbac-auth-provider';
import { ChartErrorBoundary } from '@/components/charts/chart-error-boundary';
import {
  useReportCardByOrg,
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
  GradeHistoryTable,
  MonthSelector,
} from '@/components/report-card';
import { getReportCardMonth } from '@/lib/utils/format-value';
import Link from 'next/link';
import { FileText, RefreshCcw, Building2, Calendar } from 'lucide-react';

/**
 * Report Card View Component
 *
 * Displays practice performance metrics, trends, and peer comparisons.
 * Users select by organization - the system queries by organization_id.
 */
export default function ReportCardView() {
  const { userContext, isLoading: authLoading } = useAuth();
  const [selectedOrgId, setSelectedOrgId] = useState<string | undefined>(undefined);
  const [selectedMonth, setSelectedMonth] = useState<string | undefined>(undefined);
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('3_month');
  const [selectedPeerBucket, setSelectedPeerBucket] = useState<SizeBucket | undefined>(undefined);

  // Get the report card month (last full month)
  const reportCardMonthInfo = useMemo(() => getReportCardMonth(), []);
  const reportCardMonth = reportCardMonthInfo.monthYear;

  // Check if user has all-access permission (super user)
  const canViewAll = useMemo(() => {
    if (!userContext?.all_permissions) return false;
    return userContext.all_permissions.some((p) => p.name === 'analytics:read:all');
  }, [userContext]);

  // Fetch organizations for the org selector (super users see all, regular users see theirs)
  const { data: allOrganizations = [], isLoading: loadingOrgs } = useOrganizations();

  // Build list of selectable organizations
  const selectableOrgs = useMemo(() => {
    if (canViewAll) {
      // Super user - can select any organization
      return allOrganizations;
    }
    // Regular user - filter to only their organizations
    if (!userContext?.organizations) return [];
    const userOrgIds = new Set(userContext.organizations.map((o) => o.organization_id));
    return allOrganizations.filter((org) => userOrgIds.has(org.id));
  }, [canViewAll, allOrganizations, userContext?.organizations]);

  // Auto-select organization for users with only one org
  useEffect(() => {
    if (!selectedOrgId && selectableOrgs.length === 1 && selectableOrgs[0]) {
      setSelectedOrgId(selectableOrgs[0].id);
    }
  }, [selectableOrgs, selectedOrgId]);

  // Determine if organization selector should be shown
  // Only show if user has multiple organizations to choose from
  const showOrgSelector = selectableOrgs.length > 1;

  // Fetch report card by organization ID
  const {
    data: reportCardData,
    isLoading: isLoadingReportCard,
    error: reportCardError,
    refetch: refetchReportCard,
  } = useReportCardByOrg(selectedOrgId, selectedMonth);

  // Default peer bucket to practice's bucket, allow override
  const practiceBucket = reportCardData?.reportCard?.size_bucket;
  const effectivePeerBucket = selectedPeerBucket ?? practiceBucket;

  const { data: peerData, isLoading: isLoadingPeer } = usePeerComparison(effectivePeerBucket);

  const reportCard = reportCardData?.reportCard;
  const previousMonth = reportCardData?.previousMonth;
  const availableMonths = reportCardData?.availableMonths || [];
  const peerComparison = peerData?.comparison;

  const isLoading = authLoading || loadingOrgs || isLoadingReportCard;

  // Reset peer bucket and month selection when org changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset on org change only
  useEffect(() => {
    setSelectedPeerBucket(undefined);
    setSelectedMonth(undefined);
  }, [selectedOrgId]);

  // Render organization selector
  const renderFilters = () => {
    if (!showOrgSelector) return null;

    return (
      <div className="flex flex-wrap items-center gap-4 mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <Building2 className="w-4 h-4" />
          <span className="font-medium">Organization:</span>
        </div>

        {/* Organization selector */}
        <div className="w-72">
          <HierarchySelect
            items={selectableOrgs}
            value={selectedOrgId}
            onChange={(id) => setSelectedOrgId(id as string | undefined)}
            idField="id"
            nameField="name"
            parentField="parent_organization_id"
            activeField="is_active"
            placeholder="Select an Organization"
            disabled={loadingOrgs}
            showSearch
            allowClear={canViewAll}
            rootLabel={canViewAll ? 'All Organizations' : 'My Organizations'}
          />
        </div>
      </div>
    );
  };

  // No organization selected state
  if (!authLoading && !loadingOrgs && !selectedOrgId) {
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
              {selectableOrgs.length === 0 ? 'No Organization Access' : 'Select an Organization'}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              {selectableOrgs.length === 0
                ? 'Your account is not associated with any organization. Please contact your administrator.'
                : 'Select an organization above to view their report card.'}
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
        <div className="sm:flex sm:justify-between sm:items-center mb-8">
          <div className="mb-4 sm:mb-0">
            <h1 className="text-2xl md:text-3xl text-slate-800 dark:text-slate-100 font-bold">
              Practice Report Card
            </h1>
          </div>
        </div>

        {renderFilters()}

        <div className="bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 p-6 rounded-2xl">
          <h3 className="font-semibold mb-2">Failed to load report card</h3>
          <p className="text-sm mb-4">
            There was an error loading your report card. This may be because no report card has
            been generated for this organization yet.
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

        {renderFilters()}

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
          <div className="text-center py-12">
            <div className="p-4 rounded-full bg-amber-100 dark:bg-amber-900/30 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
              <FileText className="w-10 h-10 text-amber-500" />
            </div>
            <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-2">
              Report Card Not Available
            </h3>
            <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              The report card for this organization has not been generated yet. Report cards are
              generated periodically based on practice data.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Extract practice values for peer comparison
  const practiceValues: Record<string, number> = {};
  if (reportCard.measure_scores) {
    for (const [measureName, scoreData] of Object.entries(reportCard.measure_scores)) {
      practiceValues[measureName] = scoreData.value;
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-7xl mx-auto">
      {/* Header */}
      <div className="sm:flex sm:justify-between sm:items-center mb-8">
        <div className="mb-4 sm:mb-0">
          <div className="flex items-center gap-4 flex-wrap">
            <h1 className="text-2xl md:text-3xl text-slate-800 dark:text-slate-100 font-bold">
              {selectedMonth
                ? `${new Date(`${selectedMonth}T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} Report Card`
                : `${reportCardMonth} Report Card`}
            </h1>
            {/* Month Selector - only show if multiple months available */}
            {availableMonths.length > 1 && (
              <MonthSelector
                availableMonths={availableMonths}
                selectedMonth={selectedMonth}
                onMonthChange={setSelectedMonth}
                isLoading={isLoadingReportCard}
              />
            )}
          </div>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            {selectedMonth
              ? `Historical report card from ${new Date(`${selectedMonth}T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
              : `How your practice performed in ${reportCardMonthInfo.monthName}`}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/report-card/annual-review"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors text-sm font-medium"
          >
            <Calendar className="w-4 h-4" />
            Annual Review
          </Link>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Generated:{' '}
            {new Date(reportCard.generated_at).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        </div>
      </div>

      {/* Filters */}
      {renderFilters()}

      {/* Main grid layout */}
      <ChartErrorBoundary chartName="Report Card">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Overall Score Card */}
          <div className="lg:col-span-5">
            <OverallScoreCard
              score={reportCard.overall_score}
              sizeBucket={reportCard.size_bucket}
              percentileRank={reportCard.percentile_rank}
              reportCardMonth={
                selectedMonth
                  ? new Date(`${selectedMonth}T00:00:00`).toLocaleDateString('en-US', {
                      month: 'long',
                      year: 'numeric',
                    })
                  : reportCardMonth
              }
              previousMonth={previousMonth}
            />
          </div>

          {/* Insights Panel */}
          <div className="lg:col-span-7">
            <InsightsPanel insights={reportCard.insights} />
          </div>

          {/* Measure Breakdown */}
          <div className="lg:col-span-6">
            <MeasureBreakdown measureScores={reportCard.measure_scores} />
          </div>

          {/* Trend Chart - Placeholder until org-based trends API is ready */}
          <div className="lg:col-span-6">
            <ChartErrorBoundary chartName="Trend Chart">
              <TrendChart trends={[]} selectedPeriod={trendPeriod} onPeriodChange={setTrendPeriod} />
            </ChartErrorBoundary>
          </div>

          {/* Peer Comparison */}
          {peerComparison && (
            <div className="lg:col-span-12">
              <PeerComparisonPanel
                comparison={peerComparison}
                practiceValues={practiceValues}
                measureScores={reportCard.measure_scores}
                practiceBucket={reportCard.size_bucket}
                selectedBucket={effectivePeerBucket}
                onBucketChange={setSelectedPeerBucket}
                isLoadingPeer={isLoadingPeer}
              />
            </div>
          )}

          {/* Grade History - Placeholder until org-based history API is ready */}
          <div className="lg:col-span-12">
            <GradeHistoryTable history={[]} isLoading={false} />
          </div>
        </div>
      </ChartErrorBoundary>
    </div>
  );
}
