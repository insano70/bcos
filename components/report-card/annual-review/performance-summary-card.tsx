'use client';

import { motion } from 'framer-motion';
import { Award } from 'lucide-react';
import { applyGradeFloor } from '@/lib/utils/format-value';
import { getTrendDisplay } from '@/lib/utils/annual-review-helpers';
import type { AnnualReviewSummary } from '@/lib/types/report-card';

interface PerformanceSummaryCardProps {
  summary: AnnualReviewSummary;
}

/**
 * Performance summary card showing average, highest, lowest scores and trend
 */
export function PerformanceSummaryCard({ summary }: PerformanceSummaryCardProps) {
  const { Icon, color, label, bg } = getTrendDisplay(summary.trend);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="lg:col-span-6 bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700"
    >
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
        <Award className="w-5 h-5 text-amber-500" />
        Performance Summary
      </h2>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-slate-600 dark:text-slate-300">Average Score</span>
          <span className="text-xl font-semibold text-slate-800 dark:text-slate-100">
            {applyGradeFloor(summary.averageScore).toFixed(1)}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-slate-600 dark:text-slate-300">Highest Score</span>
          <span className="text-xl font-semibold text-emerald-500">
            {applyGradeFloor(summary.highestScore).toFixed(1)}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-slate-600 dark:text-slate-300">Lowest Score</span>
          <span className="text-xl font-semibold text-amber-500">
            {applyGradeFloor(summary.lowestScore).toFixed(1)}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-slate-600 dark:text-slate-300">Overall Trend</span>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${bg}`}>
            <Icon className={`w-4 h-4 ${color}`} />
            <span className={`text-sm font-medium ${color}`}>{label}</span>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Based on {summary.monthsAnalyzed} months of data
          </span>
        </div>
      </div>
    </motion.div>
  );
}
