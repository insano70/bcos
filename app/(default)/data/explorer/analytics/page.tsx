'use client';

import { useState, useRef, useId } from 'react';
import { useFeedbackAnalytics } from '@/lib/hooks/use-data-explorer';
import ProtectedComponent from '@/components/rbac/protected-component';
// TODO: Integrate with project's existing chart components (AnalyticsChart, etc.)
// For now, using simple data displays until chart integration is complete

export default function AnalyticsDashboardPage() {
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | undefined>(undefined);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const startDateId = useId();
  const endDateId = useId();

  const { data: analytics, isLoading, error } = useFeedbackAnalytics(dateRange);

  const handleDateRangeChange = (start: string, end: string) => {
    setDateRange({ start, end });
    setShowDatePicker(false);
  };

  const handleClearDateRange = () => {
    setDateRange(undefined);
    setShowDatePicker(false);
  };

  // Data prepared for display (charts will be integrated later)

  return (
    <ProtectedComponent permission="data-explorer:manage:all">
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
        {/* Page header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
              Feedback Analytics
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Comprehensive insights into Data Explorer feedback and AI performance
            </p>
          </div>

          {/* Date Range Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
            >
              {dateRange ? `${dateRange.start} to ${dateRange.end}` : 'All Time'}
            </button>

            {showDatePicker && (
              <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-4 z-10">
                <div className="space-y-3">
                  <div>
                    <label htmlFor={startDateId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Start Date
                    </label>
                    <input
                      ref={startDateRef}
                      type="date"
                      id={startDateId}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label htmlFor={endDateId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      End Date
                    </label>
                    <input
                      ref={endDateRef}
                      type="date"
                      id={endDateId}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const start = startDateRef.current?.value;
                        const end = endDateRef.current?.value;
                        if (start && end) handleDateRangeChange(start, end);
                      }}
                      className="flex-1 px-3 py-2 bg-violet-600 text-white rounded-md hover:bg-violet-700"
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={handleClearDateRange}
                      className="flex-1 px-3 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-400 dark:hover:bg-gray-500"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
            <p className="text-gray-600 dark:text-gray-400 mt-4">Loading analytics...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-red-800 dark:text-red-400">Failed to load analytics. Please try again.</p>
          </div>
        ) : analytics ? (
          <div className="space-y-6">
            {/* Overview Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Total Feedback</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                      {analytics.overview.totalFeedback}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-violet-100 dark:bg-violet-900/20 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                </div>
                <div className="mt-2 flex items-center text-sm">
                  <span className="text-green-600 dark:text-green-400">
                    {analytics.trends.weekOverWeekChange > 0 ? '+' : ''}
                    {analytics.trends.weekOverWeekChange.toFixed(1)}%
                  </span>
                  <span className="text-gray-600 dark:text-gray-400 ml-2">vs last week</span>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Resolution Rate</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                      {analytics.overview.resolutionRate.toFixed(1)}%
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  {analytics.overview.resolvedFeedback} of {analytics.overview.totalFeedback} resolved
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Critical Issues</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                      {analytics.overview.criticalIssues}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  Pending resolution
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Avg Resolution Time</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                      {analytics.overview.averageResolutionTime.toFixed(1)}h
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  Time to resolve
                </p>
              </div>
            </div>

            {/* Impact Metrics */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Impact Metrics</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Metadata Updates</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                    {analytics.impactMetrics.metadataUpdates}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Instructions Created</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                    {analytics.impactMetrics.instructionsCreated}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Relationships Added</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                    {analytics.impactMetrics.relationshipsAdded}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Edit Rate Reduction</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                    {analytics.impactMetrics.editRateReduction > 0 ? '-' : ''}
                    {Math.abs(analytics.impactMetrics.editRateReduction).toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>

            {/* Data Tables (Chart integration pending) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Feedback by Type */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Feedback by Type
                </h2>
                <div className="space-y-2">
                  {Object.entries(analytics.trends.feedbackByType).map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-900/50 rounded">
                      <span className="text-sm text-gray-700 dark:text-gray-300">{type.replace(/_/g, ' ')}</span>
                      <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Feedback by Severity */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  By Severity
                </h2>
                <div className="space-y-2">
                  {Object.entries(analytics.trends.feedbackBySeverity).map(([severity, count]) => (
                    <div key={severity} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-900/50 rounded">
                      <span className="text-sm text-gray-700 dark:text-gray-300">{severity.toUpperCase()}</span>
                      <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Top Issues */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Top Issues
              </h2>
              <div className="space-y-3">
                {analytics.topIssues.slice(0, 5).map((issue) => (
                  <div key={issue.issue} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {issue.issue}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {issue.affectedTables.length > 0 ? `Tables: ${issue.affectedTables.join(', ')}` : 'No tables specified'}
                      </p>
                    </div>
                    <div className="ml-4 text-right">
                      <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{issue.count}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">occurrences</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </ProtectedComponent>
  );
}

