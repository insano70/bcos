/**
 * Warming Job Cache Service
 *
 * Redis-backed cache for warming job tracking across multiple ECS instances.
 * Extends CacheService base class for consistent error handling and logging.
 *
 * PROBLEM SOLVED:
 * The original CacheWarmingTracker stored jobs in-memory (Map/array), causing
 * the "Recent Jobs" panel to flash between states when requests hit different
 * ECS containers. This service stores job state in Redis for consistency.
 *
 * KEY NAMING (following lib/cache/base.ts standard):
 *   warming:job:{jobId}  - Individual job data (STRING with TTL)
 *   warming:active       - SET of active job IDs
 *   warming:recent       - SORTED SET of recent jobs (scored by timestamp)
 *
 * ARCHITECTURE:
 * - Extends CacheService<WarmingJob> for base GET/SET/DEL
 * - Custom methods for SET and SORTED SET operations
 * - Graceful degradation when Redis unavailable
 */

import { log } from '@/lib/logger';
import { CacheService } from '@/lib/cache/base';

/**
 * Warming job status
 */
export type WarmingJobStatus = 'queued' | 'warming' | 'completed' | 'failed';

/**
 * Warming job data structure
 */
export interface WarmingJob {
  jobId: string;
  datasourceId: number;
  datasourceName: string;
  status: WarmingJobStatus;
  startedAt: string;
  completedAt: string | null;
  progress: number; // 0-100
  rowsProcessed: number;
  rowsTotal: number;
  entriesCached: number;
  duration: number | null;
  error: string | null;
}

/**
 * Summary statistics for warming jobs
 */
export interface WarmingJobSummary {
  activeJobs: number;
  recentJobs: number;
  successRate: number;
  avgDuration: number;
  currentlyWarming: number[];
}

/**
 * Warming Job Cache Service
 * Handles Redis operations for warming job tracking
 */
class WarmingJobCacheService extends CacheService<WarmingJob> {
  protected namespace = 'warming';
  protected defaultTTL = 3600; // 1 hour for active jobs

  // Constants
  private readonly RECENT_JOBS_TTL = 24 * 60 * 60; // 24 hours in seconds
  private readonly MAX_RECENT_JOBS = 50;
  private readonly ACTIVE_INDEX_KEY = 'warming:active';
  private readonly RECENT_JOBS_KEY = 'warming:recent';

  /**
   * Get job by ID
   *
   * @param jobId - Job ID
   * @returns Job data or null if not found
   */
  async getJob(jobId: string): Promise<WarmingJob | null> {
    const key = this.buildKey('job', jobId);
    return this.get<WarmingJob>(key);
  }

  /**
   * Save job data
   *
   * @param job - Job to save
   * @returns Success boolean
   */
  async saveJob(job: WarmingJob): Promise<boolean> {
    const key = this.buildKey('job', job.jobId);
    return this.set(key, job);
  }

  /**
   * Delete job data
   *
   * @param jobId - Job ID to delete
   * @returns Success boolean
   */
  async deleteJob(jobId: string): Promise<boolean> {
    const key = this.buildKey('job', jobId);
    return this.del(key);
  }

  /**
   * Add job ID to active index
   * Uses SADD for set operations (pattern from IndexedCacheClient)
   *
   * @param jobId - Job ID to add
   * @returns Success boolean
   */
  async addToActiveIndex(jobId: string): Promise<boolean> {
    const client = this.getClient();
    if (!client) {
      return false;
    }

    try {
      await client.sadd(this.ACTIVE_INDEX_KEY, jobId);
      return true;
    } catch (error) {
      log.error(
        'Failed to add job to active index',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'warming-job-cache',
          operation: 'addToActiveIndex',
          jobId,
        }
      );
      return false;
    }
  }

  /**
   * Remove job ID from active index
   *
   * @param jobId - Job ID to remove
   * @returns Success boolean
   */
  async removeFromActiveIndex(jobId: string): Promise<boolean> {
    const client = this.getClient();
    if (!client) {
      return false;
    }

    try {
      await client.srem(this.ACTIVE_INDEX_KEY, jobId);
      return true;
    } catch (error) {
      log.error(
        'Failed to remove job from active index',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'warming-job-cache',
          operation: 'removeFromActiveIndex',
          jobId,
        }
      );
      return false;
    }
  }

  /**
   * Get all active job IDs
   *
   * @returns Array of active job IDs
   */
  async getActiveJobIds(): Promise<string[]> {
    const client = this.getClient();
    if (!client) {
      return [];
    }

    try {
      return await client.smembers(this.ACTIVE_INDEX_KEY);
    } catch (error) {
      log.error(
        'Failed to get active job IDs',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'warming-job-cache',
          operation: 'getActiveJobIds',
        }
      );
      return [];
    }
  }

  /**
   * Get all active jobs with full data
   * Uses SMEMBERS + individual GETs (pattern from IndexedCacheClient)
   *
   * @returns Array of active jobs
   */
  async getActiveJobs(): Promise<WarmingJob[]> {
    const jobIds = await this.getActiveJobIds();
    if (jobIds.length === 0) {
      return [];
    }

    const jobs: WarmingJob[] = [];
    for (const jobId of jobIds) {
      const job = await this.getJob(jobId);
      if (job) {
        jobs.push(job);
      }
    }

    return jobs;
  }

  /**
   * Add job to recent jobs sorted set
   * Uses ZADD with timestamp as score for ordering
   *
   * @param job - Completed/failed job to add
   * @returns Success boolean
   */
  async addToRecentJobs(job: WarmingJob): Promise<boolean> {
    const client = this.getClient();
    if (!client) {
      return false;
    }

    try {
      const score = Date.now();
      const serialized = JSON.stringify(job);
      await client.zadd(this.RECENT_JOBS_KEY, score, serialized);

      // Trim to keep only last N jobs
      await client.zremrangebyrank(this.RECENT_JOBS_KEY, 0, -(this.MAX_RECENT_JOBS + 1));

      return true;
    } catch (error) {
      log.error(
        'Failed to add job to recent jobs',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'warming-job-cache',
          operation: 'addToRecentJobs',
          jobId: job.jobId,
        }
      );
      return false;
    }
  }

  /**
   * Get recent jobs from sorted set
   * Uses ZREVRANGE for newest-first ordering
   * Automatically cleans up jobs older than 24 hours
   *
   * @param limit - Maximum number of jobs to return
   * @returns Array of recent jobs
   */
  async getRecentJobs(limit: number = 10): Promise<WarmingJob[]> {
    const client = this.getClient();
    if (!client) {
      return [];
    }

    try {
      // Clean up jobs older than 24 hours
      const cutoffTime = Date.now() - this.RECENT_JOBS_TTL * 1000;
      await client.zremrangebyscore(this.RECENT_JOBS_KEY, '-inf', cutoffTime);

      // Get recent jobs (newest first)
      const results = await client.zrevrange(this.RECENT_JOBS_KEY, 0, limit - 1);

      const jobs: WarmingJob[] = [];
      for (const serialized of results) {
        try {
          const job = JSON.parse(serialized) as WarmingJob;
          jobs.push(job);
        } catch (parseError) {
          log.error(
            'Failed to parse recent job',
            parseError instanceof Error ? parseError : new Error(String(parseError)),
            {
              component: 'warming-job-cache',
              operation: 'getRecentJobs',
            }
          );
        }
      }

      return jobs;
    } catch (error) {
      log.error(
        'Failed to get recent jobs',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'warming-job-cache',
          operation: 'getRecentJobs',
        }
      );
      return [];
    }
  }

  /**
   * Check if a datasource is currently warming
   *
   * @param datasourceId - Datasource ID to check
   * @returns True if datasource is warming
   */
  async isWarming(datasourceId: number): Promise<boolean> {
    const activeJobs = await this.getActiveJobs();
    return activeJobs.some(
      (job) => job.datasourceId === datasourceId && job.status === 'warming'
    );
  }

  /**
   * Get summary statistics
   *
   * @returns Summary statistics
   */
  async getSummary(): Promise<WarmingJobSummary> {
    const activeJobs = await this.getActiveJobs();
    const recentJobs = await this.getRecentJobs(20);

    const successCount = recentJobs.filter((j) => j.status === 'completed').length;
    const successRate = recentJobs.length > 0
      ? Math.round((successCount / recentJobs.length) * 100)
      : 0;

    const jobsWithDuration = recentJobs.filter((j) => j.duration !== null);
    const avgDuration = jobsWithDuration.length > 0
      ? Math.round(
          jobsWithDuration.reduce((sum, j) => sum + (j.duration ?? 0), 0) /
            jobsWithDuration.length
        )
      : 0;

    return {
      activeJobs: activeJobs.length,
      recentJobs: recentJobs.length,
      successRate,
      avgDuration,
      currentlyWarming: activeJobs
        .filter((j) => j.status === 'warming')
        .map((j) => j.datasourceId),
    };
  }

  /**
   * Clear all recent jobs history
   *
   * @returns Success boolean
   */
  async clearHistory(): Promise<boolean> {
    const client = this.getClient();
    if (!client) {
      return false;
    }

    try {
      await client.del(this.RECENT_JOBS_KEY);
      log.info('Warming job history cleared', {
        component: 'warming-job-cache',
      });
      return true;
    } catch (error) {
      log.error(
        'Failed to clear warming job history',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'warming-job-cache',
          operation: 'clearHistory',
        }
      );
      return false;
    }
  }

  /**
   * Check if Redis is available for warming job cache
   *
   * @returns True if Redis is available
   */
  isRedisAvailable(): boolean {
    return this.getClient() !== null;
  }

  /**
   * Required by CacheService base class
   * Invalidate cache entries by pattern
   *
   * @param pattern - Optional pattern to match
   */
  async invalidate(pattern?: string): Promise<void> {
    if (pattern) {
      await this.delPattern(pattern);
    } else {
      // Invalidate all warming cache
      await this.delPattern(`${this.namespace}:*`);
    }
  }
}

// Export singleton instance
export const warmingJobCache = new WarmingJobCacheService();

