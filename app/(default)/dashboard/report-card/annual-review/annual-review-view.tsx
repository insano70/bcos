'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth/rbac-auth-provider';
import { useAnnualReview } from '@/lib/hooks/use-report-card';
import { useOrganizations } from '@/lib/hooks/use-organizations';
import HierarchySelect from '@/components/hierarchy-select';
import { 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  ArrowLeft,
  Target,
  Award,
  BarChart3,
  Building2,
  Sparkles,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { applyGradeFloor, getGradeColor, getGradeBgColor } from '@/lib/utils/format-value';
import type { MeasureYoYComparison } from '@/lib/types/report-card';

/**
 * Format measure value based on format type
 */
function formatMeasureDisplayValue(value: number, formatType: 'number' | 'currency' | 'percentage'): string {
  if (formatType === 'currency') {
    if (value >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(1)}M`;
    }
    if (value >= 1_000) {
      return `$${(value / 1_000).toFixed(1)}K`;
    }
    return `$${value.toFixed(0)}`;
  }
  if (formatType === 'percentage') {
    return `${value.toFixed(1)}%`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toFixed(0);
}

/**
 * Get trend icon and color
 */
function getTrendDisplay(trend: 'improving' | 'declining' | 'stable') {
  switch (trend) {
    case 'improving':
      return { Icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Improving' };
    case 'declining':
      return { Icon: TrendingDown, color: 'text-rose-500', bg: 'bg-rose-500/10', label: 'Declining' };
    default:
      return { Icon: Minus, color: 'text-slate-500', bg: 'bg-slate-500/10', label: 'Stable' };
  }
}

/**
 * Annual Review View Component
 * 
 * Displays comprehensive year-over-year analysis including:
 * - Year-over-year comparison
 * - Monthly score chart
 * - Performance summary statistics
 * - Future forecast
 */
export default function AnnualReviewView() {
  const { userContext, isLoading: authLoading } = useAuth();
  const [selectedPracticeUid, setSelectedPracticeUid] = useState<number | undefined>(undefined);
  const [selectedOrgId, setSelectedOrgId] = useState<string | undefined>(undefined);

  // Check if user has all-access permission
  const canViewAll = useMemo(() => {
    if (!userContext?.all_permissions) return false;
    return userContext.all_permissions.some((p) => p.name === 'analytics:read:all');
  }, [userContext]);

  // Fetch organizations for super users
  const { data: allOrganizations = [], isLoading: loadingOrgs } = useOrganizations();

  // Get practice UIDs
  const practiceUids = useMemo(() => {
    if (canViewAll && selectedOrgId) {
      const org = allOrganizations.find((o) => o.id === selectedOrgId);
      return org?.practice_uids || [];
    }
    
    if (canViewAll && !selectedOrgId) {
      const uids: number[] = [];
      for (const org of allOrganizations) {
        if (org.practice_uids) {
          uids.push(...org.practice_uids);
        }
      }
      return Array.from(new Set(uids));
    }

    if (!userContext?.organizations) return [];
    const uids: number[] = [];
    for (const org of userContext.organizations) {
      if (org.practice_uids) {
        uids.push(...org.practice_uids);
      }
    }
    return Array.from(new Set(uids));
  }, [userContext, canViewAll, selectedOrgId, allOrganizations]);

  // Set initial practice UID
  useEffect(() => {
    if (practiceUids.length > 0 && !selectedPracticeUid) {
      setSelectedPracticeUid(practiceUids[0]);
    }
  }, [practiceUids, selectedPracticeUid]);

  // Reset practice when org changes
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

  // Fetch annual review data
  const { data: reviewData, isLoading: isLoadingReview, error } = useAnnualReview(selectedPracticeUid);
  const review = reviewData?.review;

  const isLoading = authLoading || loadingOrgs || isLoadingReview;

  // Determine if org selector should be shown
  const showOrgSelector = useMemo(() => {
    if (canViewAll) {
      return allOrganizations.length > 1;
    }
    return (userContext?.organizations?.length ?? 0) > 1;
  }, [canViewAll, allOrganizations.length, userContext?.organizations?.length]);

  // Loading state
  if (isLoading && !review) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center py-24">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500 mb-4" />
          <span className="text-slate-600 dark:text-slate-400">Loading annual review...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-7xl mx-auto">
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
      {/* Header with back link */}
      <div className="mb-6">
        <Link 
          href="/dashboard/report-card"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Report Card
        </Link>
      </div>

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

      {/* Organization selector */}
      {showOrgSelector && (
        <div className="flex flex-wrap items-center gap-4 mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <Building2 className="w-4 h-4" />
            <span className="font-medium">Organization:</span>
          </div>
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
              rootLabel={canViewAll ? 'All Organizations' : 'My Organizations'}
            />
          </div>
        </div>
      )}

      {/* No data state */}
      {!review || review.monthlyScores.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
          <div className="text-center py-12">
            <div className="p-4 rounded-full bg-slate-100 dark:bg-slate-800 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
              <BarChart3 className="w-10 h-10 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-2">
              No Data Available
            </h3>
            <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              There isn't enough historical data to generate an annual review yet.
              Check back after a few months of report cards have been generated.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Year over Year Comparison */}
          {review.yearOverYear && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="lg:col-span-12 bg-gradient-to-br from-violet-500/10 to-purple-600/5 rounded-2xl p-6 border border-violet-200 dark:border-violet-800"
            >
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-violet-500" />
                Year over Year Comparison
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Previous Year */}
                <div className="bg-white/50 dark:bg-slate-800/50 rounded-xl p-4">
                  <div className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                    {review.yearOverYear.previousYear}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-3xl font-bold ${getGradeColor(review.yearOverYear.previousYearGrade)}`}>
                      {review.yearOverYear.previousYearGrade}
                    </span>
                    <span className="text-lg text-slate-600 dark:text-slate-300">
                      {applyGradeFloor(review.yearOverYear.previousYearAverage).toFixed(1)}
                    </span>
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Average Score
                  </div>
                </div>

                {/* Change indicator */}
                <div className="flex flex-col items-center justify-center">
                  <div className={`text-3xl font-bold ${
                    review.yearOverYear.changePercent > 0 ? 'text-emerald-500' :
                    review.yearOverYear.changePercent < 0 ? 'text-rose-500' :
                    'text-slate-500'
                  }`}>
                    {review.yearOverYear.changePercent > 0 ? '+' : ''}
                    {review.yearOverYear.changePercent.toFixed(1)}%
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    {review.yearOverYear.changePercent > 0 && (
                      <TrendingUp className="w-4 h-4 text-emerald-500" />
                    )}
                    {review.yearOverYear.changePercent < 0 && (
                      <TrendingDown className="w-4 h-4 text-rose-500" />
                    )}
                    {review.yearOverYear.changePercent === 0 && (
                      <Minus className="w-4 h-4 text-slate-500" />
                    )}
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      Year over Year
                    </span>
                  </div>
                </div>

                {/* Current Year */}
                <div className="bg-white/50 dark:bg-slate-800/50 rounded-xl p-4">
                  <div className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                    {review.yearOverYear.currentYear}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-3xl font-bold ${getGradeColor(review.yearOverYear.currentYearGrade)}`}>
                      {review.yearOverYear.currentYearGrade}
                    </span>
                    <span className="text-lg text-slate-600 dark:text-slate-300">
                      {applyGradeFloor(review.yearOverYear.currentYearAverage).toFixed(1)}
                    </span>
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Average Score
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Summary Statistics */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="lg:col-span-6 bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700"
          >
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" />
              Performance Summary
            </h2>

            <div className="space-y-4">
              {/* Average Score */}
              <div className="flex justify-between items-center">
                <span className="text-slate-600 dark:text-slate-300">Average Score</span>
                <span className="text-xl font-semibold text-slate-800 dark:text-slate-100">
                  {applyGradeFloor(review.summary.averageScore).toFixed(1)}
                </span>
              </div>

              {/* Highest Score */}
              <div className="flex justify-between items-center">
                <span className="text-slate-600 dark:text-slate-300">Highest Score</span>
                <span className="text-xl font-semibold text-emerald-500">
                  {applyGradeFloor(review.summary.highestScore).toFixed(1)}
                </span>
              </div>

              {/* Lowest Score */}
              <div className="flex justify-between items-center">
                <span className="text-slate-600 dark:text-slate-300">Lowest Score</span>
                <span className="text-xl font-semibold text-amber-500">
                  {applyGradeFloor(review.summary.lowestScore).toFixed(1)}
                </span>
              </div>

              {/* Trend */}
              <div className="flex justify-between items-center">
                <span className="text-slate-600 dark:text-slate-300">Overall Trend</span>
                <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${getTrendDisplay(review.summary.trend).bg}`}>
                  {(() => {
                    const { Icon, color, label } = getTrendDisplay(review.summary.trend);
                    return (
                      <>
                        <Icon className={`w-4 h-4 ${color}`} />
                        <span className={`text-sm font-medium ${color}`}>{label}</span>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Months Analyzed */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  Based on {review.summary.monthsAnalyzed} months of data
                </span>
              </div>
            </div>
          </motion.div>

          {/* Forecast with Month-by-Month Projections */}
          {review.forecast && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="lg:col-span-6 bg-gradient-to-br from-blue-500/10 to-indigo-600/5 rounded-2xl p-6 border border-blue-200 dark:border-blue-800"
            >
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-500" />
                Projected Performance
              </h2>

              <div className="text-center py-4">
                <div className={`inline-block px-6 py-3 rounded-2xl ${getGradeBgColor(review.forecast.projectedGrade)}`}>
                  <span className={`text-5xl font-bold ${getGradeColor(review.forecast.projectedGrade)}`}>
                    {review.forecast.projectedGrade}
                  </span>
                </div>
                <div className="mt-4 text-lg text-slate-700 dark:text-slate-200">
                  Projected Score: <span className="font-semibold">{applyGradeFloor(review.forecast.projectedScore).toFixed(1)}</span>
                </div>
              </div>

              {/* Month-by-Month Projections */}
              {review.forecast.monthlyProjections && review.forecast.monthlyProjections.length > 0 && (
                <div className="mt-4 p-4 bg-white/50 dark:bg-slate-800/50 rounded-xl">
                  <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                    Month-by-Month Forecast
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {review.forecast.monthlyProjections.map((proj) => (
                      <div 
                        key={proj.month}
                        className="text-center p-2 bg-white/50 dark:bg-slate-700/50 rounded-lg"
                      >
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {proj.monthLabel}
                        </div>
                        <div className={`text-lg font-bold ${getGradeColor(proj.projectedGrade)}`}>
                          {proj.projectedGrade}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-300">
                          {applyGradeFloor(proj.projectedScore).toFixed(0)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 p-4 bg-white/50 dark:bg-slate-800/50 rounded-xl">
                <div className="flex items-start gap-2">
                  <Target className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {review.forecast.projectionNote}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                      Confidence: {review.forecast.confidence.charAt(0).toUpperCase() + review.forecast.confidence.slice(1)} 
                      {' '}(based on {review.forecast.basedOnMonths} months)
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Per-Measure Year-over-Year Comparison */}
          {review.measureYoY && review.measureYoY.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.25 }}
              className="lg:col-span-12 bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700"
            >
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-violet-500" />
                Measure Performance: {review.currentYear - 1} vs {review.currentYear}
              </h2>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                        Measure
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                        {review.currentYear - 1} Avg
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                        {review.currentYear} Avg
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                        Change
                      </th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {review.measureYoY.map((measure: MeasureYoYComparison, index: number) => (
                      <tr 
                        key={measure.measureName}
                        className={`border-b border-slate-100 dark:border-slate-700/50 ${
                          index % 2 === 0 ? 'bg-slate-50/50 dark:bg-slate-800/50' : ''
                        }`}
                      >
                        <td className="py-3 px-4">
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {measure.displayName}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-300">
                          {formatMeasureDisplayValue(measure.previousYearAverage, measure.formatType)}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-800 dark:text-slate-200 font-medium">
                          {formatMeasureDisplayValue(measure.currentYearAverage, measure.formatType)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className={`font-medium ${
                            measure.improved ? 'text-emerald-600' : 'text-rose-600'
                          }`}>
                            {measure.changePercent > 0 ? '+' : ''}
                            {measure.changePercent.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {measure.improved ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                              <ChevronUp className="w-3 h-3" />
                              Improved
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400">
                              <ChevronDown className="w-3 h-3" />
                              Declined
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* Monthly Score Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="lg:col-span-12 bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700"
          >
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-6">
              Monthly Performance History
            </h2>

            {/* Score timeline with grade cards */}
            <div className="overflow-x-auto pb-2">
              <div className="flex gap-3 min-w-max">
                {review.monthlyScores.slice().reverse().map((month, index) => {
                  const gradeScore = applyGradeFloor(month.score);
                  return (
                    <motion.div
                      key={month.month}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.03 }}
                      className="flex flex-col items-center"
                    >
                      {/* Grade card */}
                      <div
                        className={`w-16 h-20 rounded-xl flex flex-col items-center justify-center shadow-sm border-2 ${
                          month.grade.startsWith('A') 
                            ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700' 
                            : month.grade.startsWith('B') 
                            ? 'bg-teal-50 dark:bg-teal-900/30 border-teal-300 dark:border-teal-700' 
                            : 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700'
                        }`}
                      >
                        <span className={`text-2xl font-bold ${getGradeColor(month.grade)}`}>
                          {month.grade}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {Math.round(gradeScore)}
                        </span>
                      </div>
                      {/* Month label */}
                      <div className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                        {month.monthLabel.split(' ')[0]?.slice(0, 3)}
                      </div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500">
                        {month.monthLabel.split(' ')[1]?.slice(2)}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

