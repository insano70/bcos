'use client';

import { motion } from 'framer-motion';
import { BarChart3, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { applyGradeFloor, getGradeColor } from '@/lib/utils/format-value';
import type { YearOverYearComparison } from '@/lib/types/report-card';

interface YearOverYearCardProps {
  yearOverYear: YearOverYearComparison;
}

/**
 * Year-over-year comparison card showing previous and current year grades
 * with change indicator
 */
export function YearOverYearCard({ yearOverYear }: YearOverYearCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="lg:col-span-12 bg-gradient-to-br from-violet-500/10 to-purple-600/5 rounded-2xl p-6 border border-violet-200 dark:border-violet-800"
    >
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-violet-500" />
        Year over Year Comparison
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Previous Year */}
        <div className="bg-white/50 dark:bg-slate-800/50 rounded-xl p-4">
          <div className="text-sm text-slate-500 dark:text-slate-400 mb-2">
            {yearOverYear.previousYear}
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-bold ${getGradeColor(yearOverYear.previousYearGrade)}`}>
              {yearOverYear.previousYearGrade}
            </span>
            <span className="text-lg text-slate-600 dark:text-slate-300">
              {applyGradeFloor(yearOverYear.previousYearAverage).toFixed(1)}
            </span>
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">Average Score</div>
        </div>

        {/* Change indicator */}
        <div className="flex flex-col items-center justify-center">
          <div
            className={`text-3xl font-bold ${
              yearOverYear.changePercent > 0
                ? 'text-emerald-500'
                : yearOverYear.changePercent < 0
                  ? 'text-rose-500'
                  : 'text-slate-500'
            }`}
          >
            {yearOverYear.changePercent > 0 ? '+' : ''}
            {yearOverYear.changePercent.toFixed(1)}%
          </div>
          <div className="flex items-center gap-1 mt-2">
            {yearOverYear.changePercent > 0 && <TrendingUp className="w-4 h-4 text-emerald-500" />}
            {yearOverYear.changePercent < 0 && <TrendingDown className="w-4 h-4 text-rose-500" />}
            {yearOverYear.changePercent === 0 && <Minus className="w-4 h-4 text-slate-500" />}
            <span className="text-sm text-slate-500 dark:text-slate-400">Year over Year</span>
          </div>
        </div>

        {/* Current Year */}
        <div className="bg-white/50 dark:bg-slate-800/50 rounded-xl p-4">
          <div className="text-sm text-slate-500 dark:text-slate-400 mb-2">
            {yearOverYear.currentYear}
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-bold ${getGradeColor(yearOverYear.currentYearGrade)}`}>
              {yearOverYear.currentYearGrade}
            </span>
            <span className="text-lg text-slate-600 dark:text-slate-300">
              {applyGradeFloor(yearOverYear.currentYearAverage).toFixed(1)}
            </span>
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">Average Score</div>
        </div>
      </div>
    </motion.div>
  );
}
