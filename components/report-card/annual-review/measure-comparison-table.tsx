'use client';

import { motion } from 'framer-motion';
import { BarChart3, ChevronUp, ChevronDown } from 'lucide-react';
import { formatMeasureDisplayValue } from '@/lib/utils/annual-review-helpers';
import type { MeasureYoYComparison } from '@/lib/types/report-card';

interface MeasureComparisonTableProps {
  measureYoY: MeasureYoYComparison[];
  currentYear: number;
}

/**
 * Per-measure year-over-year comparison table
 */
export function MeasureComparisonTable({ measureYoY, currentYear }: MeasureComparisonTableProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.25 }}
      className="lg:col-span-12 bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700"
    >
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-violet-500" />
        Monthly Performance: {currentYear - 1} vs {currentYear}
      </h2>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="text-left py-3 px-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                Measure
              </th>
              <th className="text-right py-3 px-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                {currentYear - 1} Avg
              </th>
              <th className="text-right py-3 px-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                {currentYear} Avg
              </th>
              <th className="text-right py-3 px-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                Change
              </th>
              <th className="text-center py-3 px-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {measureYoY.map((measure, index) => (
              <tr
                key={measure.measureName}
                className={`border-b border-slate-100 dark:border-slate-700/50 ${
                  index % 2 === 0 ? 'bg-slate-50/50 dark:bg-slate-800/50' : ''
                }`}
              >
                <td className="py-3 px-4">
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {measure.displayName}
                  </span>
                </td>
                <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-300">
                  {formatMeasureDisplayValue(measure.previousYearAverage, measure.formatType)}
                </td>
                <td className="py-3 px-4 text-right text-slate-800 dark:text-slate-200 font-medium">
                  {formatMeasureDisplayValue(measure.currentYearAverage, measure.formatType)}
                </td>
                <td className="py-3 px-4 text-right">
                  <span
                    className={`font-medium ${measure.improved ? 'text-emerald-600' : 'text-rose-600'}`}
                  >
                    {measure.changePercent > 0 ? '+' : ''}
                    {measure.changePercent.toFixed(1)}%
                  </span>
                </td>
                <td className="py-3 px-4 text-center">
                  {measure.improved ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                      <ChevronUp className="w-3 h-3" />
                      Improved
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400">
                      <ChevronDown className="w-3 h-3" />
                      Declined
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
