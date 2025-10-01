import { logger } from '@/lib/logger';
import { analyticsCache } from './analytics-cache';

/**
 * Chart Data Refresh Scheduler
 * Implements automated chart updates and background refresh jobs
 */

export interface RefreshSchedule {
  chartDefinitionId: string;
  refreshInterval: number; // milliseconds
  lastRefresh: Date;
  nextRefresh: Date;
  isActive: boolean;
  retryCount: number;
  maxRetries: number;
}

export interface RefreshJob {
  id: string;
  chartDefinitionId: string;
  scheduledTime: Date;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
  duration?: number;
}

export class ChartRefreshScheduler {
  private schedules = new Map<string, RefreshSchedule>();
  private jobs = new Map<string, RefreshJob>();
  private intervals = new Map<string, NodeJS.Timeout>();

  /**
   * Schedule automatic refresh for a chart
   */
  scheduleChart(chartDefinitionId: string, intervalMinutes: number = 30): void {
    const intervalMs = intervalMinutes * 60 * 1000;
    const now = new Date();

    const schedule: RefreshSchedule = {
      chartDefinitionId,
      refreshInterval: intervalMs,
      lastRefresh: now,
      nextRefresh: new Date(now.getTime() + intervalMs),
      isActive: true,
      retryCount: 0,
      maxRetries: 3,
    };

    this.schedules.set(chartDefinitionId, schedule);

    // Set up the actual interval
    const intervalId = setInterval(async () => {
      await this.refreshChart(chartDefinitionId);
    }, intervalMs);

    this.intervals.set(chartDefinitionId, intervalId);

    logger.info('Chart refresh scheduled', {
      chartDefinitionId,
      intervalMinutes,
      nextRefresh: schedule.nextRefresh,
    });
  }

  /**
   * Unschedule automatic refresh for a chart
   */
  unscheduleChart(chartDefinitionId: string): void {
    const intervalId = this.intervals.get(chartDefinitionId);
    if (intervalId) {
      clearInterval(intervalId);
      this.intervals.delete(chartDefinitionId);
    }

    const schedule = this.schedules.get(chartDefinitionId);
    if (schedule) {
      schedule.isActive = false;
      this.schedules.set(chartDefinitionId, schedule);
    }

    logger.info('Chart refresh unscheduled', { chartDefinitionId });
  }

  /**
   * Manually refresh a chart's data
   */
  async refreshChart(chartDefinitionId: string): Promise<void> {
    const jobId = `refresh_${chartDefinitionId}_${Date.now()}`;
    const startTime = Date.now();

    const job: RefreshJob = {
      id: jobId,
      chartDefinitionId,
      scheduledTime: new Date(),
      status: 'running',
    };

    this.jobs.set(jobId, job);

    try {
      logger.info('Starting chart refresh', { chartDefinitionId, jobId });

      // TODO: Implement proper cache invalidation based on chart parameters
      // analyticsCache.invalidatePattern({ /* proper params */ });

      // Update schedule
      const schedule = this.schedules.get(chartDefinitionId);
      if (schedule) {
        const now = new Date();
        schedule.lastRefresh = now;
        schedule.nextRefresh = new Date(now.getTime() + schedule.refreshInterval);
        schedule.retryCount = 0; // Reset retry count on successful refresh
        this.schedules.set(chartDefinitionId, schedule);
      }

      // Update job status
      job.status = 'completed';
      job.duration = Date.now() - startTime;
      this.jobs.set(jobId, job);

      logger.info('Chart refresh completed', {
        chartDefinitionId,
        jobId,
        duration: job.duration,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Update job status
      job.status = 'failed';
      job.error = errorMessage;
      job.duration = Date.now() - startTime;
      this.jobs.set(jobId, job);

      // Handle retry logic
      const schedule = this.schedules.get(chartDefinitionId);
      if (schedule && schedule.retryCount < schedule.maxRetries) {
        schedule.retryCount++;
        this.schedules.set(chartDefinitionId, schedule);

        // Retry after 5 minutes
        setTimeout(
          () => {
            this.refreshChart(chartDefinitionId);
          },
          5 * 60 * 1000
        );

        logger.warn('Chart refresh failed, retrying', {
          chartDefinitionId,
          retryCount: schedule.retryCount,
          maxRetries: schedule.maxRetries,
          error: errorMessage,
        });
      } else {
        logger.error('Chart refresh failed permanently', {
          chartDefinitionId,
          error: errorMessage,
          retryCount: schedule?.retryCount || 0,
        });
      }
    }
  }

  /**
   * Get refresh status for a chart
   */
  getRefreshStatus(chartDefinitionId: string): RefreshSchedule | null {
    return this.schedules.get(chartDefinitionId) || null;
  }

  /**
   * Get all active schedules
   */
  getActiveSchedules(): RefreshSchedule[] {
    return Array.from(this.schedules.values()).filter((schedule) => schedule.isActive);
  }

  /**
   * Get recent refresh jobs
   */
  getRecentJobs(limit: number = 10): RefreshJob[] {
    return Array.from(this.jobs.values())
      .sort((a, b) => b.scheduledTime.getTime() - a.scheduledTime.getTime())
      .slice(0, limit);
  }

  /**
   * Clean up old job records
   */
  cleanupOldJobs(): void {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

    for (const [jobId, job] of Array.from(this.jobs.entries())) {
      if (job.scheduledTime < cutoffTime) {
        this.jobs.delete(jobId);
      }
    }

    logger.debug('Old refresh jobs cleaned up', {
      remainingJobs: this.jobs.size,
    });
  }

  /**
   * Initialize scheduler with cleanup interval
   */
  initialize(): void {
    // Clean up old jobs every hour
    setInterval(
      () => {
        this.cleanupOldJobs();
      },
      60 * 60 * 1000
    );

    logger.info('Chart refresh scheduler initialized');
  }

  /**
   * Shutdown scheduler and clear all intervals
   */
  shutdown(): void {
    // Clear all intervals
    for (const intervalId of Array.from(this.intervals.values())) {
      clearInterval(intervalId);
    }

    this.intervals.clear();

    // Mark all schedules as inactive
    for (const [chartId, schedule] of Array.from(this.schedules.entries())) {
      schedule.isActive = false;
      this.schedules.set(chartId, schedule);
    }

    logger.info('Chart refresh scheduler shutdown');
  }
}

// Export singleton instance
export const chartRefreshScheduler = new ChartRefreshScheduler();
