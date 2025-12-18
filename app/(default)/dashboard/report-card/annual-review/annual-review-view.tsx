'use client';

import Link from 'next/link';
import { useAnnualReviewByOrg } from '@/lib/hooks/use-report-card';
import { useOrgSelection } from '@/lib/hooks/use-org-selection';
import HierarchySelect from '@/components/hierarchy-select';
import { Spinner } from '@/components/ui/spinner';
import { Calendar, ArrowLeft, BarChart3, Building2 } from 'lucide-react';
import {
  YearOverYearCard,
  PerformanceSummaryCard,
  ProjectedPerformanceCard,
  MeasureComparisonTable,
  MonthlyPerformanceHistory,
} from '@/components/report-card/annual-review';

/**
 * Annual Review View Component
 *
 * Displays comprehensive year-over-year analysis including:
 * - Year-over-year comparison
 * - Monthly score chart
 * - Performance summary statistics
 * - Future forecast
 *
 * Users select by organization - the system queries by organization_id.
 */
export default function AnnualReviewView() {
  const {
    selectedOrgId,
    setSelectedOrgId,
    showOrgSelector,
    selectableOrgs,
    canViewAll,
    authLoading,
    loadingOrgs,
  } = useOrgSelection();

  // Fetch annual review data by organization
  const {
    data: reviewData,
    isLoading: isLoadingReview,
    error,
  } = useAnnualReviewByOrg(selectedOrgId);
  const review = reviewData?.review;

  const isLoading = authLoading || loadingOrgs || isLoadingReview;

  // Render organization selector
  const renderOrgSelector = () => {
    if (!showOrgSelector) return null;

    return (
      <div className="flex flex-wrap items-center gap-4 mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <Building2 className="w-4 h-4" />
          <span className="font-medium">Organization:</span>
        </div>
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

  // Shared back link component
  const BackLink = () => (
    <div className="mb-6">
      <Link
        href={selectedOrgId ? `/dashboard/report-card?org=${selectedOrgId}` : '/dashboard/report-card'}
        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Report Card
      </Link>
    </div>
  );

  // Shared page header
  const PageHeader = () => (
    <div className="sm:flex sm:justify-between sm:items-center mb-8">
      <div className="mb-4 sm:mb-0">
        <h1 className="text-2xl md:text-3xl text-slate-800 dark:text-slate-100 font-bold flex items-center gap-3">
          <Calendar className="w-8 h-8 text-violet-500" />
          Annual Review
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">
          Year-over-year performance analysis and projections
        </p>
      </div>
    </div>
  );

  // No organization selected state
  if (!authLoading && !loadingOrgs && !selectedOrgId) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-7xl mx-auto">
        <BackLink />
        <PageHeader />
        {renderOrgSelector()}

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
          <div className="text-center py-12">
            <div className="p-4 rounded-full bg-slate-100 dark:bg-slate-800 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
              <Calendar className="w-10 h-10 text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">
              {selectableOrgs.length === 0 ? 'No Organization Access' : 'Select an Organization'}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              {selectableOrgs.length === 0
                ? 'Your account is not associated with any organization. Please contact your administrator.'
                : 'Select an organization above to view their annual review.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading && !review) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center py-24">
          <Spinner size="lg" className="mb-4" />
          <span className="text-slate-600 dark:text-slate-400">Loading annual review...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-7xl mx-auto">
        <BackLink />
        {renderOrgSelector()}

        <div className="bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 p-6 rounded-2xl">
          <h3 className="font-semibold mb-2">Failed to load annual review</h3>
          <p className="text-sm">
            There was an error loading the annual review. Please try again later.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-7xl mx-auto">
      <BackLink />
      <PageHeader />
      {renderOrgSelector()}

      {/* No data state */}
      {!review || review.monthlyScores.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
          <div className="text-center py-12">
            <div className="p-4 rounded-full bg-slate-100 dark:bg-slate-800 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
              <BarChart3 className="w-10 h-10 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">
              No Data Available
            </h3>
            <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              There isn't enough historical data to generate an annual review yet. Check back after
              a few months of report cards have been generated.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Year over Year Comparison */}
          {review.yearOverYear && <YearOverYearCard yearOverYear={review.yearOverYear} />}

          {/* Performance Summary */}
          <PerformanceSummaryCard summary={review.summary} />

          {/* Projected Performance */}
          {review.forecast && <ProjectedPerformanceCard forecast={review.forecast} />}

          {/* Per-Measure Year-over-Year Comparison */}
          {review.measureYoY && review.measureYoY.length > 0 && (
            <MeasureComparisonTable measureYoY={review.measureYoY} currentYear={review.currentYear} />
          )}

          {/* Monthly Performance History */}
          <MonthlyPerformanceHistory monthlyScores={review.monthlyScores} />
        </div>
      )}
    </div>
  );
}
