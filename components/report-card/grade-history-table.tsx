'use client';

import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, History } from 'lucide-react';
import type { GradeHistoryEntry } from '@/lib/types/report-card';
import { applyGradeFloor, getGradeColor, getGradeBgColor } from '@/lib/utils/format-value';

interface GradeHistoryTableProps {
  history: GradeHistoryEntry[];
  isLoading?: boolean;
  className?: string;
}

/**
 * Get change indicator
 */
function ChangeIndicator({ 
  scoreChange, 
  gradeChange 
}: { 
  scoreChange: number | null; 
  gradeChange: 'up' | 'down' | 'same' | null;
}) {
  if (scoreChange === null || gradeChange === null) {
    return <span className="text-gray-400 text-xs">—</span>;
  }

  const IconComponent = 
    gradeChange === 'up' ? TrendingUp : 
    gradeChange === 'down' ? TrendingDown : 
    Minus;

  const colorClass = 
    gradeChange === 'up' ? 'text-emerald-500' : 
    gradeChange === 'down' ? 'text-rose-500' : 
    'text-gray-400';

  const bgClass = 
    gradeChange === 'up' ? 'bg-emerald-500/10' : 
    gradeChange === 'down' ? 'bg-rose-500/10' : 
    'bg-gray-400/10';

  return (
    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${bgClass}`}>
      <IconComponent className={`w-3 h-3 ${colorClass}`} />
      <span className={`text-xs font-medium ${colorClass}`}>
        {scoreChange > 0 ? '+' : ''}{scoreChange.toFixed(1)}
      </span>
    </div>
  );
}

/**
 * Loading skeleton for the table
 */
const SKELETON_ROWS = ['row-1', 'row-2', 'row-3', 'row-4', 'row-5', 'row-6'];

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {SKELETON_ROWS.map((rowId) => (
        <div key={rowId} className="flex items-center gap-4 py-2">
          <div className="h-4 w-20 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-gray-700 dark:via-gray-600 dark:to-gray-700 rounded animate-shimmer bg-[length:200%_100%]" />
          <div className="h-6 w-10 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-gray-700 dark:via-gray-600 dark:to-gray-700 rounded animate-shimmer bg-[length:200%_100%]" />
          <div className="h-4 w-12 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-gray-700 dark:via-gray-600 dark:to-gray-700 rounded animate-shimmer bg-[length:200%_100%]" />
          <div className="h-4 w-16 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-gray-700 dark:via-gray-600 dark:to-gray-700 rounded animate-shimmer bg-[length:200%_100%]" />
        </div>
      ))}
    </div>
  );
}

/**
 * Grade History Table Component
 * 
 * Displays the last 12 months of report card grades in a tabular format.
 * Shows grade, score, percentile rank, and month-over-month change.
 */
export default function GradeHistoryTable({
  history,
  isLoading,
  className = '',
}: GradeHistoryTableProps) {
  if (isLoading) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
        <div className="flex items-center gap-2 mb-4">
          <History className="w-5 h-5 text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Grade History
          </h3>
        </div>
        <TableSkeleton />
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
        <div className="flex items-center gap-2 mb-4">
          <History className="w-5 h-5 text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Grade History
          </h3>
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          No historical grades available yet. Report cards are generated monthly.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <History className="w-5 h-5 text-gray-500" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Grade History
        </h3>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          (Last {history.length} months)
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Month
              </th>
              <th className="text-center py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Grade
              </th>
              <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Score
              </th>
              <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Percentile
              </th>
              <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Change
              </th>
            </tr>
          </thead>
          <tbody>
            {history.map((entry, index) => (
              <motion.tr
                key={entry.month}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: index * 0.03 }}
                className={`border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${
                  index === 0 ? 'bg-gray-50/50 dark:bg-gray-700/20' : ''
                }`}
              >
                {/* Month */}
                <td className="py-3 px-2">
                  <span className={`text-sm font-medium ${
                    index === 0 
                      ? 'text-gray-900 dark:text-white' 
                      : 'text-gray-600 dark:text-gray-300'
                  }`}>
                    {entry.monthLabel}
                  </span>
                  {index === 0 && (
                    <span className="ml-2 text-xs text-blue-500 font-medium">Current</span>
                  )}
                </td>

                {/* Grade */}
                <td className="py-3 px-2 text-center">
                  <span className={`inline-block px-2.5 py-1 rounded-lg font-bold text-sm ${getGradeBgColor(entry.grade)} ${getGradeColor(entry.grade)}`}>
                    {entry.grade}
                  </span>
                </td>

                {/* Score */}
                <td className="py-3 px-2 text-right">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    {applyGradeFloor(entry.score).toFixed(1)}
                  </span>
                </td>

                {/* Percentile */}
                <td className="py-3 px-2 text-right">
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {entry.percentileRank.toFixed(0)}%
                  </span>
                </td>

                {/* Change */}
                <td className="py-3 px-2 text-right">
                  <div className="flex justify-end">
                    <ChangeIndicator 
                      scoreChange={entry.scoreChange} 
                      gradeChange={entry.gradeChange} 
                    />
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary Stats */}
      {history.length >= 3 && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex flex-wrap gap-4 text-sm">
            <GradeSummary history={history} />
          </div>
        </div>
      )}
    </motion.div>
  );
}

/**
 * Summary statistics for grade history
 */
function GradeSummary({ history }: { history: GradeHistoryEntry[] }) {
  const scores = history.map(h => applyGradeFloor(h.score));
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  
  // Count grade improvements vs declines
  const improvements = history.filter(h => h.gradeChange === 'up').length;
  const declines = history.filter(h => h.gradeChange === 'down').length;
  
  return (
    <>
      <div className="flex items-center gap-1.5">
        <span className="text-gray-500 dark:text-gray-400">Avg:</span>
        <span className="font-medium text-gray-700 dark:text-gray-200">
          {avgScore.toFixed(1)}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-gray-500 dark:text-gray-400">High:</span>
        <span className="font-medium text-emerald-600 dark:text-emerald-400">
          {maxScore.toFixed(1)}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-gray-500 dark:text-gray-400">Low:</span>
        <span className="font-medium text-amber-600 dark:text-amber-400">
          {minScore.toFixed(1)}
        </span>
      </div>
      {(improvements > 0 || declines > 0) && (
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 dark:text-gray-400">Trend:</span>
          <span className="flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">{improvements}</span>
          </span>
          <span className="flex items-center gap-1">
            <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
            <span className="text-rose-600 dark:text-rose-400 font-medium">{declines}</span>
          </span>
        </div>
      )}
    </>
  );
}

