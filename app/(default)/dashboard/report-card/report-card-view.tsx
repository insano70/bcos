'use client';

import { useState, useEffect } from 'react';
import { ChartErrorBoundary } from '@/components/charts/chart-error-boundary';
import {
  useReportCardByOrg,
  usePeerComparison,
} from '@/lib/hooks/use-report-card';
import { useOrgSelection } from '@/lib/hooks/use-org-selection';
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
  EngagementCard,
} from '@/components/report-card';
import Link from 'next/link';
import { FileText, RefreshCcw, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

/**
 * Report Card View Component
 *
 * Displays practice performance metrics, trends, and peer comparisons.
 * Users select by organization - the system queries by organization_id.
 */
export default function ReportCardView() {
  const {
    selectedOrgId,
    setSelectedOrgId,
    showOrgSelector,
    selectableOrgs,
    canViewAll,
    authLoading,
    loadingOrgs,
  } = useOrgSelection();

  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('3_month');
  const [selectedPeerBucket, setSelectedPeerBucket] = useState<SizeBucket | undefined>(undefined);

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
  const gradeHistory = reportCardData?.gradeHistory || [];
  const trends = reportCardData?.trends || [];
  const engagementMetric = reportCardData?.engagementMetric;
  const peerComparison = peerData?.comparison;

  const isLoading = authLoading || loadingOrgs || isLoadingReportCard;

  // Reset peer bucket and month selection when org changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset on org change only
  useEffect(() => {
    setSelectedPeerBucket(undefined);
    setSelectedMonth('');
  }, [selectedOrgId]);

  // Set selectedMonth to latest available month when data loads
  useEffect(() => {
    const latestMonth = availableMonths[0];
    if (latestMonth && !selectedMonth) {
      setSelectedMonth(latestMonth);
    }
  }, [availableMonths, selectedMonth]);

  // Render organization selector - compact style with label above
  const renderFilters = () => {
    if (!showOrgSelector) return null;

    return (
      <div className="mb-4">
        <label className="block text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
          Organization
        </label>
        <div className="w-80 sm:w-[400px]">
          <HierarchySelect
            items={selectableOrgs}
            value={selectedOrgId}
            onChange={(id) => setSelectedOrgId(id as string | undefined)}
            idField="id"
            nameField="name"
            parentField="parent_organization_id"
            activeField="is_active"
            placeholder="Select Organization"
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
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">
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
          <Spinner size="lg" className="mb-4" />
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

        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-6 rounded-2xl">
          <h3 className="font-semibold mb-2">Failed to load report card</h3>
          <p className="text-sm mb-4">
            There was an error loading your report card. This may be because no report card has
            been generated for this organization yet.
          </p>
          <Button
            variant="violet"
            onClick={() => refetchReportCard()}
            leftIcon={<RefreshCcw className="w-4 h-4" />}
          >
            Try Again
          </Button>
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
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">
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
    <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-8 w-full max-w-7xl mx-auto">
      {/* Header - Compact on mobile */}
      <div className="mb-4 sm:mb-8">
        {/* Title */}
        <h1 className="text-xl sm:text-2xl md:text-3xl text-slate-800 dark:text-slate-100 font-bold">
          {new Date(`${reportCard.report_card_month}T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} Report Card
        </h1>
        
        {/* Controls row - Month selector and Annual Review on same line */}
        <div className="flex items-center justify-between gap-2 mt-2">
          {/* Month Selector */}
          {availableMonths.length > 1 && selectedMonth ? (
            <MonthSelector
              availableMonths={availableMonths}
              selectedMonth={selectedMonth}
              onMonthChange={setSelectedMonth}
              isLoading={isLoadingReportCard}
              compact
            />
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              How your practice performed in {new Date(`${reportCard.report_card_month}T00:00:00`).toLocaleDateString('en-US', { month: 'long' })}
            </p>
          )}
          
          {/* Annual Review link */}
          <Link
            href={selectedOrgId ? `/dashboard/report-card/annual-review?org=${selectedOrgId}` : '/dashboard/report-card/annual-review'}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors text-xs sm:text-sm font-medium whitespace-nowrap"
          >
            <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Annual Review</span>
            <span className="sm:hidden">Annual</span>
          </Link>
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
              reportCardMonth={new Date(`${reportCard.report_card_month}T00:00:00`).toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric',
              })}
              previousMonth={previousMonth}
              measureScores={reportCard.measure_scores}
            />
          </div>

          {/* Insights Panel */}
          <div className="lg:col-span-7">
            <InsightsPanel insights={reportCard.insights} />
          </div>

          {/* Engagement Card */}
          {engagementMetric && (
            <div className="lg:col-span-12">
              <EngagementCard metric={engagementMetric} />
            </div>
          )}

          {/* Measure Breakdown */}
          <div className="lg:col-span-6">
            <MeasureBreakdown measureScores={reportCard.measure_scores} />
          </div>

          {/* Trend Chart - uses actual trend data from report_card_trends table */}
          <div className="lg:col-span-6">
            <ChartErrorBoundary chartName="Trend Chart">
              <TrendChart trends={trends} selectedPeriod={trendPeriod} onPeriodChange={setTrendPeriod} />
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

          {/* Grade History */}
          <div className="lg:col-span-12">
            <GradeHistoryTable history={gradeHistory} isLoading={isLoadingReportCard} />
          </div>
        </div>
      </ChartErrorBoundary>
    </div>
  );
}
