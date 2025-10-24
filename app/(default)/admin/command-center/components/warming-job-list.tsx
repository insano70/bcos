/**
 * Warming Job List Component
 *
 * Displays active and recent cache warming jobs with progress indicators
 */

'use client';

import { formatDistanceToNow } from 'date-fns';
import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api/client';

interface WarmingJob {
  jobId: string;
  datasourceId: number;
  datasourceName: string;
  status: 'queued' | 'warming' | 'completed' | 'failed';
  startedAt: string;
  completedAt: string | null;
  progress: number;
  rowsProcessed: number;
  rowsTotal: number;
  entriesCached: number;
  duration: number | null;
  error: string | null;
  etaSeconds?: number | null;
}

interface WarmingStatusResponse {
  activeJobs: WarmingJob[];
  recentJobs: WarmingJob[];
  summary: {
    activeCount: number;
    successRate: number;
    avgDuration: number;
    currentlyWarming: number[];
  };
  timestamp: string;
}

interface WarmingJobListProps {
  autoRefresh?: boolean;
  refreshInterval?: number;
  onJobComplete?: () => void;
}

export default function WarmingJobList({
  autoRefresh = true,
  refreshInterval = 2000,
  onJobComplete,
}: WarmingJobListProps) {
  const [status, setStatus] = useState<WarmingStatusResponse | null>(null);
  const [previousActiveCount, setPreviousActiveCount] = useState<number>(0);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/admin/analytics/cache/warming/status');
      setStatus(response as WarmingStatusResponse);

      // Detect job completion
      const newActiveCount = (response as WarmingStatusResponse).activeJobs.length;
      if (previousActiveCount > 0 && newActiveCount === 0 && onJobComplete) {
        onJobComplete();
      }
      setPreviousActiveCount(newActiveCount);
    } catch (err) {
      console.error('Failed to fetch warming status:', err);
    }
  }, [previousActiveCount, onJobComplete]);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || refreshInterval === 0) return;

    const interval = setInterval(fetchStatus, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchStatus]);

  if (!status) return null;

  const { activeJobs, recentJobs } = status;

  const formatDuration = (ms: number | null): string => {
    if (ms === null) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatETA = (seconds: number | null): string => {
    if (seconds === null || seconds <= 0) return 'Calculating...';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getStatusColor = (status: WarmingJob['status']): string => {
    switch (status) {
      case 'queued':
        return 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700';
      case 'warming':
        return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20';
      case 'completed':
        return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20';
      case 'failed':
        return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20';
      default:
        return 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700';
    }
  };

  const getStatusIcon = (status: WarmingJob['status']): string => {
    switch (status) {
      case 'queued':
        return '⏳';
      case 'warming':
        return '🔄';
      case 'completed':
        return '✅';
      case 'failed':
        return '❌';
      default:
        return '❓';
    }
  };

  return (
    <div className="space-y-4">
      {/* Active Jobs */}
      {activeJobs.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
            <span className="animate-pulse">🔥</span>
            Active Warming Operations ({activeJobs.length})
          </h4>
          <div className="space-y-3">
            {activeJobs.map((job) => (
              <div
                key={job.jobId}
                className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{getStatusIcon(job.status)}</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {job.datasourceName}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-medium ${getStatusColor(job.status)}`}
                      >
                        {job.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      DS #{job.datasourceId} • Started{' '}
                      {formatDistanceToNow(new Date(job.startedAt), { addSuffix: true })}
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                {job.status === 'warming' && (
                  <div className="mb-2">
                    <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                      <span>
                        {job.rowsProcessed.toLocaleString()} / {job.rowsTotal.toLocaleString()} rows
                      </span>
                      <span className="font-medium">{job.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-violet-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(0, job.progress))}%` }}
                      />
                    </div>
                    {job.etaSeconds !== null && job.etaSeconds !== undefined && (
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        ETA: {formatETA(job.etaSeconds)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Jobs - Always visible with fixed height to prevent layout shift */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">
          Recent Jobs ({recentJobs.length})
        </h4>
        <div className="space-y-2 min-h-[240px]">
          {recentJobs.length > 0 ? (
            recentJobs.slice(0, 5).map((job) => (
              <div
                key={job.jobId}
                className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-base">{getStatusIcon(job.status)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-900 dark:text-gray-100 truncate">
                      {job.datasourceName}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      {job.completedAt &&
                        formatDistanceToNow(new Date(job.completedAt), { addSuffix: true })}
                    </div>
                  </div>
                </div>
                <div className="text-right ml-2">
                  {job.status === 'completed' && (
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      {job.entriesCached.toLocaleString()} entries
                      <br />
                      {formatDuration(job.duration)}
                    </div>
                  )}
                  {job.status === 'failed' && (
                    <div className="text-xs text-red-600 dark:text-red-400">Failed</div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-gray-500 dark:text-gray-400">
              No recent jobs to display
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
