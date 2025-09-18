// Note: Using console for client-side logging to avoid winston fs dependency
// import { logger } from '@/lib/logger';

/**
 * Usage Analytics Service
 * Implements usage analytics dashboard showing chart access patterns and performance metrics
 */

export interface ChartUsageMetric {
  chartDefinitionId: string;
  chartName: string;
  totalViews: number;
  uniqueUsers: number;
  averageLoadTime: number;
  lastAccessed: Date;
  accessFrequency: 'high' | 'medium' | 'low';
  popularityScore: number;
}

export interface UserActivityMetric {
  userId: string;
  userName: string;
  totalChartViews: number;
  uniqueChartsViewed: number;
  averageSessionDuration: number;
  favoriteChartTypes: string[];
  lastActivity: Date;
  engagementLevel: 'high' | 'medium' | 'low';
}

export interface SystemPerformanceMetric {
  date: string;
  totalQueries: number;
  averageQueryTime: number;
  cacheHitRate: number;
  errorRate: number;
  peakConcurrentUsers: number;
  slowestQueries: Array<{
    chartDefinitionId: string;
    queryTime: number;
    timestamp: Date;
  }>;
}

export class UsageAnalyticsService {
  private chartMetrics = new Map<string, ChartUsageMetric>();
  private userMetrics = new Map<string, UserActivityMetric>();
  private performanceMetrics: SystemPerformanceMetric[] = [];
  private accessLog: Array<{
    timestamp: Date;
    userId: string;
    chartDefinitionId: string;
    action: 'view' | 'create' | 'edit' | 'delete' | 'export';
    loadTime?: number;
    userAgent?: string;
  }> = [];

  /**
   * Track chart access
   */
  trackChartAccess(
    chartDefinitionId: string,
    chartName: string,
    userId: string,
    userName: string,
    loadTime: number,
    userAgent?: string
  ): void {
    const timestamp = new Date();

    // Log the access
    this.accessLog.push({
      timestamp,
      userId,
      chartDefinitionId,
      action: 'view',
      loadTime,
      ...(userAgent && { userAgent })
    });

    // Update chart metrics
    const chartMetric = this.chartMetrics.get(chartDefinitionId) || {
      chartDefinitionId,
      chartName,
      totalViews: 0,
      uniqueUsers: 0,
      averageLoadTime: 0,
      lastAccessed: timestamp,
      accessFrequency: 'low' as const,
      popularityScore: 0
    };

    chartMetric.totalViews++;
    chartMetric.averageLoadTime = (chartMetric.averageLoadTime * (chartMetric.totalViews - 1) + loadTime) / chartMetric.totalViews;
    chartMetric.lastAccessed = timestamp;
    
    // Calculate unique users
    const uniqueUserIds = new Set(
      this.accessLog
        .filter(log => log.chartDefinitionId === chartDefinitionId)
        .map(log => log.userId)
    );
    chartMetric.uniqueUsers = uniqueUserIds.size;

    // Calculate access frequency and popularity
    const recentAccess = this.accessLog.filter(
      log => log.chartDefinitionId === chartDefinitionId && 
             log.timestamp > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
    ).length;

    chartMetric.accessFrequency = recentAccess > 20 ? 'high' : recentAccess > 5 ? 'medium' : 'low';
    chartMetric.popularityScore = (chartMetric.totalViews * 0.7) + (chartMetric.uniqueUsers * 0.3);

    this.chartMetrics.set(chartDefinitionId, chartMetric);

    // Update user metrics
    const userMetric = this.userMetrics.get(userId) || {
      userId,
      userName,
      totalChartViews: 0,
      uniqueChartsViewed: 0,
      averageSessionDuration: 0,
      favoriteChartTypes: [],
      lastActivity: timestamp,
      engagementLevel: 'low' as const
    };

    userMetric.totalChartViews++;
    userMetric.lastActivity = timestamp;
    
    // Calculate unique charts viewed
    const uniqueCharts = new Set(
      this.accessLog
        .filter(log => log.userId === userId)
        .map(log => log.chartDefinitionId)
    );
    userMetric.uniqueChartsViewed = uniqueCharts.size;

    // Calculate engagement level
    const userRecentActivity = this.accessLog.filter(
      log => log.userId === userId && 
             log.timestamp > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    ).length;

    userMetric.engagementLevel = userRecentActivity > 15 ? 'high' : userRecentActivity > 5 ? 'medium' : 'low';

    this.userMetrics.set(userId, userMetric);

    // Client-side logging (winston causes fs module issues in browser)
    if (typeof window !== 'undefined') {
        console.debug('Chart access tracked', {
        chartDefinitionId,
        userId,
        loadTime,
        totalViews: chartMetric.totalViews
      });
    }
  }

  /**
   * Get top performing charts
   */
  getTopCharts(limit: number = 10): ChartUsageMetric[] {
    return Array.from(this.chartMetrics.values())
      .sort((a, b) => b.popularityScore - a.popularityScore)
      .slice(0, limit);
  }

  /**
   * Get most active users
   */
  getMostActiveUsers(limit: number = 10): UserActivityMetric[] {
    return Array.from(this.userMetrics.values())
      .sort((a, b) => b.totalChartViews - a.totalChartViews)
      .slice(0, limit);
  }

  /**
   * Get system performance overview
   */
  getSystemPerformance(days: number = 7): {
    overview: {
      totalChartViews: number;
      uniqueUsers: number;
      averageLoadTime: number;
      totalCharts: number;
    };
    trends: {
      dailyViews: Array<{ date: string; views: number }>;
      performanceTrend: Array<{ date: string; avgLoadTime: number }>;
    };
    alerts: Array<{
      type: 'slow_query' | 'high_error_rate' | 'low_cache_hit';
      message: string;
      severity: 'low' | 'medium' | 'high';
      timestamp: Date;
    }>;
  } {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const recentLogs = this.accessLog.filter(log => log.timestamp > cutoffDate);

    // Calculate overview metrics
    const totalChartViews = recentLogs.length;
    const uniqueUsers = new Set(recentLogs.map(log => log.userId)).size;
    const averageLoadTime = recentLogs.reduce((sum, log) => sum + (log.loadTime || 0), 0) / totalChartViews;
    const totalCharts = this.chartMetrics.size;

    // Calculate daily trends
    const dailyViews = this.groupByDay(recentLogs, 'views');
    const performanceTrend = this.groupByDay(recentLogs, 'performance');

    // Generate alerts
    const alerts = this.generatePerformanceAlerts(recentLogs);

    return {
      overview: {
        totalChartViews,
        uniqueUsers,
        averageLoadTime,
        totalCharts
      },
      trends: {
        dailyViews: dailyViews.map(d => ({ date: d.date, views: d.views || 0 })),
        performanceTrend: performanceTrend.map(d => ({ date: d.date, avgLoadTime: d.avgLoadTime || 0 }))
      },
      alerts
    };
  }

  /**
   * Get chart access patterns
   */
  getAccessPatterns(): {
    peakHours: Array<{ hour: number; accessCount: number }>;
    popularChartTypes: Array<{ type: string; count: number }>;
    userEngagement: {
      highEngagement: number;
      mediumEngagement: number;
      lowEngagement: number;
    };
  } {
    // Analyze peak hours
    const hourlyAccess: Record<number, number> = {};
    this.accessLog.forEach(log => {
      const hour = log.timestamp.getHours();
      hourlyAccess[hour] = (hourlyAccess[hour] || 0) + 1;
    });

    const peakHours = Object.entries(hourlyAccess)
      .map(([hour, count]) => ({ hour: parseInt(hour), accessCount: count }))
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, 5);

    // Analyze popular chart types
    const chartTypeAccess: Record<string, number> = {};
    this.chartMetrics.forEach(metric => {
      // This would typically come from the chart definition
      const chartType = 'bar'; // Placeholder
      chartTypeAccess[chartType] = (chartTypeAccess[chartType] || 0) + metric.totalViews;
    });

    const popularChartTypes = Object.entries(chartTypeAccess)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    // Analyze user engagement
    const userEngagement = {
      highEngagement: Array.from(this.userMetrics.values()).filter(u => u.engagementLevel === 'high').length,
      mediumEngagement: Array.from(this.userMetrics.values()).filter(u => u.engagementLevel === 'medium').length,
      lowEngagement: Array.from(this.userMetrics.values()).filter(u => u.engagementLevel === 'low').length
    };

    return {
      peakHours,
      popularChartTypes,
      userEngagement
    };
  }

  /**
   * Export usage analytics data
   */
  exportUsageData(format: 'csv' | 'json' = 'csv'): string {
    const data = Array.from(this.chartMetrics.values());

    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    }

    // CSV format
    const headers = ['Chart Name', 'Total Views', 'Unique Users', 'Avg Load Time', 'Last Accessed', 'Popularity Score'];
    const rows = data.map(metric => [
      metric.chartName,
      metric.totalViews,
      metric.uniqueUsers,
      metric.averageLoadTime.toFixed(2),
      metric.lastAccessed.toISOString(),
      metric.popularityScore.toFixed(2)
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  /**
   * Clean up old access logs
   */
  cleanupOldLogs(retentionDays: number = 90): void {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    
    this.accessLog = this.accessLog.filter(log => log.timestamp > cutoffDate);
    
    // Server-side only logging
    if (typeof window === 'undefined') {
        console.info('Usage analytics logs cleaned up', {
        retentionDays,
        remainingLogs: this.accessLog.length
      });
    }
  }

  private groupByDay(
    logs: typeof this.accessLog,
    type: 'views' | 'performance'
  ): Array<{ date: string; views?: number; avgLoadTime?: number }> {
    const grouped: Record<string, { views: number; totalLoadTime: number; count: number }> = {};

    logs.forEach(log => {
      const dateKey = log.timestamp.toISOString().split('T')[0];
      if (!dateKey) return;
      
      if (!grouped[dateKey]) {
        grouped[dateKey] = { views: 0, totalLoadTime: 0, count: 0 };
      }

      grouped[dateKey].views++;
      if (log.loadTime) {
        grouped[dateKey].totalLoadTime += log.loadTime;
        grouped[dateKey].count++;
      }
    });

    return Object.entries(grouped)
      .map(([date, data]) => ({
        date,
        ...(type === 'views' 
          ? { views: data.views }
          : { avgLoadTime: data.count > 0 ? data.totalLoadTime / data.count : 0 }
        )
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private generatePerformanceAlerts(logs: typeof this.accessLog): Array<{
    type: 'slow_query' | 'high_error_rate' | 'low_cache_hit';
    message: string;
    severity: 'low' | 'medium' | 'high';
    timestamp: Date;
  }> {
    const alerts: Array<{
      type: 'slow_query' | 'high_error_rate' | 'low_cache_hit';
      message: string;
      severity: 'low' | 'medium' | 'high';
      timestamp: Date;
    }> = [];

    // Check for slow queries
    const slowQueries = logs.filter(log => (log.loadTime || 0) > 5000); // > 5 seconds
    if (slowQueries.length > 0) {
      alerts.push({
        type: 'slow_query',
        message: `${slowQueries.length} slow chart queries detected (>5s load time)`,
        severity: slowQueries.length > 10 ? 'high' : 'medium',
        timestamp: new Date()
      });
    }

    // Check for high error rate (this would typically come from error logs)
    // Placeholder implementation
    const errorRate = 0; // Would be calculated from actual error logs
    if (errorRate > 0.05) { // > 5% error rate
      alerts.push({
        type: 'high_error_rate',
        message: `High error rate detected: ${(errorRate * 100).toFixed(1)}%`,
        severity: errorRate > 0.1 ? 'high' : 'medium',
        timestamp: new Date()
      });
    }

    return alerts;
  }
}

// Export singleton instance
export const usageAnalyticsService = new UsageAnalyticsService();
