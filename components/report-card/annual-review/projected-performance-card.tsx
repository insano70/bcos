'use client';

import { motion } from 'framer-motion';
import { Sparkles, Target } from 'lucide-react';
import { applyGradeFloor, getGradeColor, getGradeBgColor } from '@/lib/utils/format-value';
import type { AnnualForecast } from '@/lib/types/report-card';

interface ProjectedPerformanceCardProps {
  forecast: AnnualForecast;
}

/**
 * Projected performance card showing forecast grade, monthly projections, and confidence
 */
export function ProjectedPerformanceCard({ forecast }: ProjectedPerformanceCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="lg:col-span-6 bg-gradient-to-br from-blue-500/10 to-indigo-600/5 rounded-2xl p-6 border border-blue-200 dark:border-blue-800"
    >
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-blue-500" />
        Projected Performance
      </h2>

      <div className="text-center py-4">
        <div className={`inline-block px-6 py-3 rounded-2xl ${getGradeBgColor(forecast.projectedGrade)}`}>
          <span className={`text-5xl font-bold ${getGradeColor(forecast.projectedGrade)}`}>
            {forecast.projectedGrade}
          </span>
        </div>
        <div className="mt-4 text-lg text-slate-700 dark:text-slate-200">
          Projected Score:{' '}
          <span className="font-semibold">{applyGradeFloor(forecast.projectedScore).toFixed(1)}</span>
        </div>
      </div>

      {forecast.monthlyProjections && forecast.monthlyProjections.length > 0 && (
        <div className="mt-4 p-4 bg-white/50 dark:bg-slate-800/50 rounded-xl">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
            Month-by-Month Forecast
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {forecast.monthlyProjections.map((proj) => (
              <div
                key={proj.month}
                className="text-center p-2 bg-white/50 dark:bg-slate-700/50 rounded-lg"
              >
                <div className="text-xs text-slate-500 dark:text-slate-400">{proj.monthLabel}</div>
                <div className={`text-lg font-bold ${getGradeColor(proj.projectedGrade)}`}>
                  {proj.projectedGrade}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  {applyGradeFloor(proj.projectedScore).toFixed(0)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 p-4 bg-white/50 dark:bg-slate-800/50 rounded-xl">
        <div className="flex items-start gap-2">
          <Target className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-300">{forecast.projectionNote}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Confidence:{' '}
              {forecast.confidence.charAt(0).toUpperCase() + forecast.confidence.slice(1)} (based on{' '}
              {forecast.basedOnMonths} months)
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
