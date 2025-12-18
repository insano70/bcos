'use client';

import { motion } from 'framer-motion';
import { applyGradeFloor, getGradeColor } from '@/lib/utils/format-value';
import type { MonthlyScore } from '@/lib/types/report-card';

interface MonthlyPerformanceHistoryProps {
  monthlyScores: MonthlyScore[];
}

/**
 * Monthly performance history with horizontal scrolling grade cards
 */
export function MonthlyPerformanceHistory({ monthlyScores }: MonthlyPerformanceHistoryProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="lg:col-span-12 bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700"
    >
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-6">
        Monthly Performance History
      </h2>

      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3 min-w-max">
          {monthlyScores
            .slice()
            .reverse()
            .map((month, index) => {
              const gradeScore = applyGradeFloor(month.score);
              return (
                <motion.div
                  key={month.month}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.03 }}
                  className="flex flex-col items-center"
                >
                  <div
                    className={`w-16 h-20 rounded-xl flex flex-col items-center justify-center shadow-sm border-2 ${
                      month.grade.startsWith('A')
                        ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700'
                        : month.grade.startsWith('B')
                          ? 'bg-teal-50 dark:bg-teal-900/30 border-teal-300 dark:border-teal-700'
                          : 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700'
                    }`}
                  >
                    <span className={`text-2xl font-bold ${getGradeColor(month.grade)}`}>
                      {month.grade}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {Math.round(gradeScore)}
                    </span>
                  </div>
                  <div className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                    {month.monthLabel.split(' ')[0]}
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-500">
                    {month.monthLabel.split(' ')[1]}
                  </div>
                </motion.div>
              );
            })}
        </div>
      </div>
    </motion.div>
  );
}
