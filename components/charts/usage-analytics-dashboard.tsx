'use client';

import { useState, useEffect } from 'react';
import { usageAnalyticsService } from '@/lib/services/usage-analytics';
import BarChart01 from './bar-chart-01';
import LineChart01 from './line-chart-01';

/**
 * Usage Analytics Dashboard
 * Shows chart access patterns and performance metrics
 */

export default function UsageAnalyticsDashboard() {
  const [performanceData, setPerformanceData] = useState<any>(null);
  const [accessPatterns, setAccessPatterns] = useState<any>(null);
  const [topCharts, setTopCharts] = useState<any[]>([]);
  const [activeUsers, setActiveUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAnalyticsData();
  }, []);

  const loadAnalyticsData = async () => {
    try {
      // Load performance metrics
      const performance = usageAnalyticsService.getSystemPerformance(7);
      setPerformanceData(performance);

      // Load access patterns
      const patterns = usageAnalyticsService.getAccessPatterns();
      setAccessPatterns(patterns);

      // Load top charts
      const charts = usageAnalyticsService.getTopCharts(10);
      setTopCharts(charts);

      // Load active users
      const users = usageAnalyticsService.getMostActiveUsers(10);
      setActiveUsers(users);

    } catch (error) {
      console.error('Failed to load analytics data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto bg-white dark:bg-gray-800 shadow-sm rounded-xl p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
          <span className="ml-3 text-gray-600 dark:text-gray-400">Loading usage analytics...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl px-6 py-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Usage Analytics Dashboard
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Monitor chart access patterns, performance metrics, and user engagement
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {performanceData?.overview.totalChartViews.toLocaleString() || '0'}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Chart Views</div>
          <div className="text-xs text-green-600 dark:text-green-400 mt-1">Last 7 days</div>
        </div>

        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {performanceData?.overview.uniqueUsers || '0'}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Active Users</div>
          <div className="text-xs text-green-600 dark:text-green-400 mt-1">Unique viewers</div>
        </div>

        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {performanceData?.overview.averageLoadTime.toFixed(1) || '0'}s
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Avg Load Time</div>
          <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">Performance metric</div>
        </div>

        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {performanceData?.overview.totalCharts || '0'}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Charts</div>
          <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">Available charts</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Views Trend */}
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            Daily Chart Views
          </h3>
          {performanceData?.trends.dailyViews && (
            <div className="h-64">
              <LineChart01
                data={{
                  labels: performanceData.trends.dailyViews.map((d: any) => d.date),
                  datasets: [{
                    label: 'Views',
                    data: performanceData.trends.dailyViews.map((d: any) => d.views),
                    borderColor: '#00AEEF',
                    backgroundColor: '#00AEEF',
                    fill: false,
                    tension: 0.4
                  }]
                }}
                width={400}
                height={250}
              />
            </div>
          )}
        </div>

        {/* Performance Trend */}
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            Performance Trend
          </h3>
          {performanceData?.trends.performanceTrend && (
            <div className="h-64">
              <LineChart01
                data={{
                  labels: performanceData.trends.performanceTrend.map((d: any) => d.date),
                  datasets: [{
                    label: 'Avg Load Time (ms)',
                    data: performanceData.trends.performanceTrend.map((d: any) => d.avgLoadTime),
                    borderColor: '#f0bb33',
                    backgroundColor: '#f0bb33',
                    fill: false,
                    tension: 0.4
                  }]
                }}
                width={400}
                height={250}
              />
            </div>
          )}
        </div>
      </div>

      {/* Top Charts and Users */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Charts */}
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            Most Popular Charts
          </h3>
          <div className="space-y-3">
            {topCharts.map((chart, index) => (
              <div key={chart.chartDefinitionId} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex items-center">
                  <div className="w-6 h-6 bg-violet-500 text-white rounded-full flex items-center justify-center text-xs font-medium mr-3">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                      {chart.chartName}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {chart.totalViews} views • {chart.uniqueUsers} users
                    </div>
                  </div>
                </div>
                <div className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {chart.popularityScore.toFixed(1)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Most Active Users */}
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            Most Active Users
          </h3>
          <div className="space-y-3">
            {activeUsers.map((user, index) => (
              <div key={user.userId} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex items-center">
                  <div className="w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-xs font-medium mr-3">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                      {user.userName}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {user.totalChartViews} views • {user.uniqueChartsViewed} charts
                    </div>
                  </div>
                </div>
                <div className={`text-xs px-2 py-1 rounded ${
                  user.engagementLevel === 'high' ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300' :
                  user.engagementLevel === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300' :
                  'bg-gray-100 text-gray-700 dark:bg-gray-600 dark:text-gray-300'
                }`}>
                  {user.engagementLevel}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Performance Alerts */}
      {performanceData?.alerts && performanceData.alerts.length > 0 && (
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            Performance Alerts
          </h3>
          <div className="space-y-3">
            {performanceData.alerts.map((alert: any, index: number) => (
              <div key={index} className={`p-4 rounded-lg border-l-4 ${
                alert.severity === 'high' ? 'border-red-500 bg-red-50 dark:bg-red-900/20' :
                alert.severity === 'medium' ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20' :
                'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              }`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {alert.type.replace('_', ' ').toUpperCase()}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {alert.message}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {alert.timestamp.toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
