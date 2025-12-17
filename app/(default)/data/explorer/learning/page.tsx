'use client';

import { useLearningMetrics } from '@/lib/hooks/use-data-explorer';
import ProtectedComponent from '@/components/rbac/protected-component';
import { Spinner } from '@/components/ui/spinner';
// Note: Uses simple data displays; AnalyticsChart integration available for richer visualization

export default function LearningMetricsPage() {
  const { data: metrics, isLoading, error } = useLearningMetrics();

  // Data prepared for display (charts will be integrated later)

  // Calculate improvement score color
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 60) return 'text-blue-600 dark:text-blue-400';
    if (score >= 40) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-100 dark:bg-green-900/20';
    if (score >= 60) return 'bg-blue-100 dark:bg-blue-900/20';
    if (score >= 40) return 'bg-yellow-100 dark:bg-yellow-900/20';
    return 'bg-red-100 dark:bg-red-900/20';
  };

  return (
    <ProtectedComponent permission="data-explorer:manage:all">
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
            Learning Loop Metrics
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Track AI improvement over time through edit rates and feedback patterns
          </p>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <Spinner size="md" />
            <p className="text-gray-600 dark:text-gray-400 mt-4">Loading metrics...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-red-800 dark:text-red-400">
              Failed to load learning metrics. Please try again.
            </p>
          </div>
        ) : metrics ? (
          <div className="space-y-6">
            {/* Improvement Score - Hero Section */}
            <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg shadow-lg p-8 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-medium opacity-90">AI Improvement Score</h2>
                  <p className="text-5xl font-bold mt-2">{metrics.improvementScore.toFixed(0)}</p>
                  <p className="text-sm opacity-75 mt-2">
                    Based on edit rate reduction and feedback patterns
                  </p>
                </div>
                <div className="relative w-32 h-32">
                  {/* Circular progress gauge */}
                  <svg className="transform -rotate-90 w-32 h-32">
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="transparent"
                      className="opacity-20"
                    />
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="transparent"
                      strokeDasharray={`${2 * Math.PI * 56}`}
                      strokeDashoffset={`${2 * Math.PI * 56 * (1 - metrics.improvementScore / 100)}`}
                      className="transition-all duration-1000"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold">{metrics.improvementScore.toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Total Queries</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                      {metrics.totalQueries.toLocaleString()}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-violet-100 dark:bg-violet-900/20 rounded-lg flex items-center justify-center">
                    <svg
                      className="w-6 h-6 text-violet-600 dark:text-violet-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  Queries executed
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Edited Queries</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                      {metrics.editedQueries.toLocaleString()}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/20 rounded-lg flex items-center justify-center">
                    <svg
                      className="w-6 h-6 text-orange-600 dark:text-orange-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  Required manual edits
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Current Edit Rate</p>
                    <p className={`text-3xl font-bold mt-1 ${getScoreColor(100 - metrics.editRate)}`}>
                      {metrics.editRate.toFixed(1)}%
                    </p>
                  </div>
                  <div
                    className={`w-12 h-12 ${getScoreBgColor(100 - metrics.editRate)} rounded-lg flex items-center justify-center`}
                  >
                    <svg
                      className={`w-6 h-6 ${getScoreColor(100 - metrics.editRate)}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      />
                    </svg>
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  {metrics.editRate < 10
                    ? 'Excellent!'
                    : metrics.editRate < 20
                      ? 'Good'
                      : metrics.editRate < 30
                        ? 'Needs improvement'
                        : 'Requires attention'}
                </p>
              </div>
            </div>

            {/* Trend Data (Chart integration pending) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Edit Rate Trend */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Edit Rate Trend (Last 12 Weeks)
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Lower is better - indicates AI is generating more accurate SQL
                  </p>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {metrics.editRateTrend.slice(-12).map((item) => (
                    <div key={item.period} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-900/50 rounded">
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {new Date(item.period).toLocaleDateString()}
                      </span>
                      <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        {item.rate.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Feedback Volume Trend */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Feedback Volume Trend (Last 12 Weeks)
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Decreasing trend indicates fewer issues being reported
                  </p>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {metrics.feedbackVolumeTrend.slice(-12).map((item) => (
                    <div key={item.period} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-900/50 rounded">
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {new Date(item.period).toLocaleDateString()}
                      </span>
                      <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Insights */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Key Insights
              </h2>
              <div className="space-y-3">
                {metrics.editRate < 10 && (
                  <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <svg
                      className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-green-900 dark:text-green-100">
                        Excellent Performance
                      </p>
                      <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                        Your edit rate is below 10%, indicating the AI is generating highly accurate SQL
                        queries with minimal manual intervention required.
                      </p>
                    </div>
                  </div>
                )}

                {metrics.editRate >= 20 && (
                  <div className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                    <svg
                      className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                        Improvement Opportunity
                      </p>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                        Your edit rate is above 20%. Review pending feedback and suggestions to improve
                        metadata quality and reduce manual edits.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <svg
                    className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      Learning Loop Active
                    </p>
                    <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                      The system is continuously learning from {metrics.editedQueries} edited queries. Each
                      correction helps improve future query generation.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </ProtectedComponent>
  );
}

