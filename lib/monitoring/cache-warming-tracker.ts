/**
 * Cache Warming Job Tracker
 *
 * Tracks active and recent cache warming operations for monitoring
 * Stores job status, progress, and history in memory
 */

import { log } from '@/lib/logger';

export interface WarmingJob {
  jobId: string;
  datasourceId: number;
  datasourceName: string;
  status: 'queued' | 'warming' | 'completed' | 'failed';
  startedAt: string;
  completedAt: string | null;
  progress: number; // 0-100
  rowsProcessed: number;
  rowsTotal: number;
  entriesCached: number;
  duration: number | null;
  error: string | null;
}

class CacheWarmingTracker {
  private activeJobs: Map<string, WarmingJob> = new Map();
  private recentJobs: WarmingJob[] = [];
  private readonly MAX_RECENT_JOBS = 50;
  private readonly MAX_JOB_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly instanceId = `tracker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  constructor() {
    log.info('CacheWarmingTracker instance created', {
      instanceId: this.instanceId,
      component: 'cache-warming-tracker',
    });
  }

  /**
   * Create a new warming job
   */
  createJob(datasourceId: number, datasourceName: string): WarmingJob {
    const jobId = `warm-${datasourceId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const job: WarmingJob = {
      jobId,
      datasourceId,
      datasourceName,
      status: 'queued',
      startedAt: new Date().toISOString(),
      completedAt: null,
      progress: 0,
      rowsProcessed: 0,
      rowsTotal: 0,
      entriesCached: 0,
      duration: null,
      error: null,
    };

    this.activeJobs.set(jobId, job);

    log.info('Warming job created', {
      jobId,
      datasourceId,
      datasourceName,
      component: 'cache-warming-tracker',
    });

    return job;
  }

  /**
   * Update job progress
   */
  updateProgress(
    jobId: string,
    progress: Partial<Pick<WarmingJob, 'progress' | 'rowsProcessed' | 'rowsTotal'>>
  ): void {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    if (progress.progress !== undefined) job.progress = progress.progress;
    if (progress.rowsProcessed !== undefined) job.rowsProcessed = progress.rowsProcessed;
    if (progress.rowsTotal !== undefined) job.rowsTotal = progress.rowsTotal;

    log.debug('Warming job progress updated', {
      jobId,
      progress: job.progress,
      rowsProcessed: job.rowsProcessed,
      component: 'cache-warming-tracker',
    });
  }

  /**
   * Mark job as started
   */
  startJob(jobId: string): void {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    job.status = 'warming';

    log.info('Warming job started', {
      jobId,
      datasourceId: job.datasourceId,
      component: 'cache-warming-tracker',
    });
  }

  /**
   * Mark job as completed successfully
   */
  completeJob(jobId: string, entriesCached: number): void {
    const job = this.activeJobs.get(jobId);
    if (!job) {
      log.warn('Attempted to complete non-existent job', {
        jobId,
        instanceId: this.instanceId,
        component: 'cache-warming-tracker',
      });
      return;
    }

    const duration = Date.now() - new Date(job.startedAt).getTime();

    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.progress = 100;
    job.entriesCached = entriesCached;
    job.duration = duration;

    // Move to recent jobs
    this.activeJobs.delete(jobId);
    this.recentJobs.unshift(job);

    // Keep only last N jobs
    if (this.recentJobs.length > this.MAX_RECENT_JOBS) {
      this.recentJobs = this.recentJobs.slice(0, this.MAX_RECENT_JOBS);
    }

    log.info('Warming job completed and added to recent jobs', {
      jobId,
      instanceId: this.instanceId,
      datasourceId: job.datasourceId,
      datasourceName: job.datasourceName,
      entriesCached,
      duration,
      totalRecentJobs: this.recentJobs.length,
      component: 'cache-warming-tracker',
    });
  }

  /**
   * Mark job as failed
   */
  failJob(jobId: string, error: string): void {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    const duration = Date.now() - new Date(job.startedAt).getTime();

    job.status = 'failed';
    job.completedAt = new Date().toISOString();
    job.duration = duration;
    job.error = error;

    // Move to recent jobs
    this.activeJobs.delete(jobId);
    this.recentJobs.unshift(job);

    // Keep only last N jobs
    if (this.recentJobs.length > this.MAX_RECENT_JOBS) {
      this.recentJobs = this.recentJobs.slice(0, this.MAX_RECENT_JOBS);
    }

    log.error('Warming job failed', new Error(error), {
      jobId,
      datasourceId: job.datasourceId,
      duration,
      component: 'cache-warming-tracker',
    });
  }

  /**
   * Get job by ID
   */
  getJob(jobId: string): WarmingJob | null {
    return this.activeJobs.get(jobId) || this.recentJobs.find((j) => j.jobId === jobId) || null;
  }

  /**
   * Get all active jobs
   */
  getActiveJobs(): WarmingJob[] {
    return Array.from(this.activeJobs.values());
  }

  /**
   * Get recent jobs history
   * Returns jobs filtered by age (< 24 hours) without mutating the array
   */
  getRecentJobs(limit: number = 10): WarmingJob[] {
    const now = Date.now();

    // Filter out jobs older than MAX_JOB_AGE_MS (24 hours)
    // IMPORTANT: Don't mutate the array - return a filtered copy
    const recentJobsFiltered = this.recentJobs.filter((job) => {
      if (!job.completedAt) return true; // Keep jobs without completion time

      const completedTime = new Date(job.completedAt).getTime();
      const age = now - completedTime;
      return age < this.MAX_JOB_AGE_MS;
    });

    log.debug('getRecentJobs called', {
      instanceId: this.instanceId,
      totalJobs: this.recentJobs.length,
      filteredJobs: recentJobsFiltered.length,
      requestedLimit: limit,
      component: 'cache-warming-tracker',
    });

    return recentJobsFiltered.slice(0, limit);
  }

  /**
   * Check if datasource is currently warming
   */
  isWarming(datasourceId: number): boolean {
    return Array.from(this.activeJobs.values()).some(
      (job) => job.datasourceId === datasourceId && job.status === 'warming'
    );
  }

  /**
   * Calculate ETA for a job in seconds
   */
  calculateETA(jobId: string): number | null {
    const job = this.activeJobs.get(jobId);
    if (!job || job.progress === 0) return null;

    const elapsedMs = Date.now() - new Date(job.startedAt).getTime();
    const progressDecimal = job.progress / 100;
    const totalEstimatedMs = elapsedMs / progressDecimal;
    const remainingMs = totalEstimatedMs - elapsedMs;

    return Math.round(remainingMs / 1000);
  }

  /**
   * Get summary statistics
   */
  getSummary() {
    const active = this.getActiveJobs();
    const recent = this.recentJobs.slice(0, 20);

    const successCount = recent.filter((j) => j.status === 'completed').length;
    const successRate = recent.length > 0 ? Math.round((successCount / recent.length) * 100) : 0;

    const avgDuration =
      recent.length > 0
        ? Math.round(
            recent
              .filter((j) => j.duration !== null)
              .reduce((sum, j) => sum + (j.duration || 0), 0) / recent.length
          )
        : 0;

    return {
      activeJobs: active.length,
      recentJobs: recent.length,
      successRate,
      avgDuration,
      currentlyWarming: active.filter((j) => j.status === 'warming').map((j) => j.datasourceId),
    };
  }

  /**
   * Clear all completed jobs from history
   */
  clearHistory(): void {
    this.recentJobs = [];
    log.info('Warming job history cleared', {
      component: 'cache-warming-tracker',
    });
  }
}

// Extend globalThis to include cache warming tracker
declare global {
  // eslint-disable-next-line no-var
  var __cacheWarmingTracker: CacheWarmingTracker | undefined;
}

// Use globalThis to ensure single instance across hot reloads in development
// In production, this works the same as a regular singleton
const cacheWarmingTracker = globalThis.__cacheWarmingTracker ?? new CacheWarmingTracker();

// Store on globalThis in development to prevent multiple instances during hot reload
if (process.env.NODE_ENV !== 'production') {
  globalThis.__cacheWarmingTracker = cacheWarmingTracker;
}

export { cacheWarmingTracker };
