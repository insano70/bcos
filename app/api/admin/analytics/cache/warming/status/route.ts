/**
 * Analytics Cache Warming Status API
 *
 * GET /api/admin/analytics/cache/warming/status
 *
 * Returns status of cache warming operations:
 * - Active warming jobs with progress
 * - Recent warming history
 * - Summary statistics
 *
 * RBAC: settings:read:all (Super Admin only)
 */

import type { NextRequest } from 'next/server';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log } from '@/lib/logger';
import { cacheWarmingTracker, type WarmingJob } from '@/lib/monitoring/cache-warming-tracker';

interface ActiveJobWithETA extends WarmingJob {
  etaSeconds: number | null;
}

interface WarmingStatusResponse {
  activeJobs: ActiveJobWithETA[];
  recentJobs: WarmingJob[];
  summary: {
    activeCount: number;
    successRate: number;
    avgDuration: number;
    currentlyWarming: number[];
  };
  timestamp: string;
}

const warmingStatusHandler = async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    log.info('Warming status request initiated', {
      operation: 'warming_status',
      component: 'analytics-cache-admin',
    });

    // Get active jobs with ETA calculation
    const activeJobs = cacheWarmingTracker.getActiveJobs();
    const activeJobsWithETA: ActiveJobWithETA[] = activeJobs.map((job) => ({
      ...job,
      etaSeconds: cacheWarmingTracker.calculateETA(job.jobId),
    }));

    // Get recent jobs
    const recentJobs = cacheWarmingTracker.getRecentJobs(20);

    // Get summary statistics
    const summary = cacheWarmingTracker.getSummary();

    const response: WarmingStatusResponse = {
      activeJobs: activeJobsWithETA,
      recentJobs,
      summary: {
        activeCount: summary.activeJobs,
        successRate: summary.successRate,
        avgDuration: summary.avgDuration,
        currentlyWarming: summary.currentlyWarming,
      },
      timestamp: new Date().toISOString(),
    };

    const duration = Date.now() - startTime;

    log.info('Warming status retrieved', {
      operation: 'warming_status',
      duration,
      activeJobs: activeJobs.length,
      recentJobs: recentJobs.length,
      component: 'analytics-cache-admin',
    });

    return createSuccessResponse(response);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error(
      'Failed to get warming status',
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: 'warming_status',
        duration,
        component: 'analytics-cache-admin',
      }
    );

    return createErrorResponse(
      error instanceof Error ? error : new Error(String(error)),
      500,
      request
    );
  }
};

// Export with RBAC protection - only super admins can view warming status
export const GET = rbacRoute(warmingStatusHandler, {
  permission: 'settings:read:all',
  rateLimit: 'api',
});
