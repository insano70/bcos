'use client';

import { motion } from 'framer-motion';
import { Activity, TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import type { EngagementMetric } from '@/lib/types/report-card';

interface EngagementCardProps {
  metric: EngagementMetric;
  className?: string;
}

/**
 * Get status based on user rate vs benchmark
 */
function getEngagementStatus(userRate: number, benchmarkRate: number): {
  status: 'excellent' | 'good' | 'needs-improvement';
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  message: string;
} {
  const ratio = benchmarkRate > 0 ? userRate / benchmarkRate : 0;

  if (ratio >= 1) {
    return {
      status: 'excellent',
      icon: <TrendingUp className="w-4 h-4" />,
      color: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
      message: 'Great engagement! You\'re checking in regularly.',
    };
  }

  if (ratio >= 0.6) {
    return {
      status: 'good',
      icon: <Minus className="w-4 h-4" />,
      color: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-100 dark:bg-amber-900/30',
      message: 'Good progress. A bit more regular check-ins could help.',
    };
  }

  return {
    status: 'needs-improvement',
    icon: <TrendingDown className="w-4 h-4" />,
    color: 'text-slate-600 dark:text-slate-400',
    bgColor: 'bg-slate-100 dark:bg-slate-800',
    message: 'Regular review of your metrics helps drive improvement.',
  };
}

/**
 * Format rate for display
 */
function formatRate(rate: number): string {
  if (rate === 0) return '0';
  if (rate < 0.1) return '<0.1';
  return rate.toFixed(1);
}

/**
 * Calculate progress percentage (capped at 100%)
 */
function getProgressPercent(userRate: number, benchmarkRate: number): number {
  if (benchmarkRate <= 0) return 0;
  return Math.min(100, Math.round((userRate / benchmarkRate) * 100));
}

/**
 * Engagement Card Component
 *
 * Displays how often the organization accesses their statistics
 * compared to the top 25% benchmark.
 */
export default function EngagementCard({ metric, className = '' }: EngagementCardProps) {
  const status = getEngagementStatus(metric.userRate, metric.benchmarkRate);
  const progressPercent = getProgressPercent(metric.userRate, metric.benchmarkRate);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 ${className}`}
    >
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
              <Activity className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">
                Statistics Engagement
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                How often you check your metrics
              </p>
            </div>
          </div>

          {/* Info tooltip */}
          <div className="group relative">
            <Info className="w-5 h-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-help" />
            <div className="absolute right-0 top-8 w-64 p-3 bg-slate-900 dark:bg-slate-700 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <p className="mb-2">
                Counts distinct days you accessed the app over the last {metric.periodDays} days. Multiple logins on the same day count as one.
              </p>
              <p className="text-slate-300">
                {metric.benchmarkIsReal
                  ? 'Benchmark is based on actual peer data.'
                  : 'Benchmark represents typical top-performing practices.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-4 sm:gap-6 mb-6">
          {/* User Rate */}
          <div className="text-center">
            <div className="text-3xl sm:text-4xl font-bold text-slate-800 dark:text-slate-100 mb-1">
              {formatRate(metric.userRate)}
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              Your check-ins/week
            </div>
          </div>

          {/* Benchmark Rate */}
          <div className="text-center">
            <div className="text-3xl sm:text-4xl font-bold text-violet-600 dark:text-violet-400 mb-1">
              {formatRate(metric.benchmarkRate)}
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {metric.benchmarkLabel}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Progress to benchmark</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.8, delay: 0.5, ease: 'easeOut' }}
              className={`h-full rounded-full ${
                progressPercent >= 100
                  ? 'bg-emerald-500'
                  : progressPercent >= 60
                    ? 'bg-amber-500'
                    : 'bg-violet-500'
              }`}
            />
          </div>
        </div>

        {/* Status Message */}
        <div className={`flex items-center gap-3 p-3 rounded-lg ${status.bgColor}`}>
          <div className={status.color}>{status.icon}</div>
          <p className="text-sm text-slate-700 dark:text-slate-300">{status.message}</p>
        </div>

        {/* Additional Context */}
        {metric.uniqueUsers > 0 && (
          <div className="mt-4 text-xs text-slate-500 dark:text-slate-400 text-center">
            Based on {metric.accessDays} day{metric.accessDays !== 1 ? 's' : ''} accessed by{' '}
            {metric.uniqueUsers} user{metric.uniqueUsers !== 1 ? 's' : ''} in the last{' '}
            {metric.periodDays} days
          </div>
        )}
      </div>
    </motion.div>
  );
}
