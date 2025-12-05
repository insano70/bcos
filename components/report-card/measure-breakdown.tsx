'use client';

import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { MeasureScore, TrendDirection } from '@/lib/types/report-card';
import { formatMeasureValue, isHigherBetter, getReportCardMonth } from '@/lib/utils/format-value';

interface MeasureBreakdownProps {
  measureScores: Record<string, MeasureScore>;
  className?: string;
}

/**
 * Get trend icon and color
 */
function getTrendDisplay(trend: TrendDirection, percentage: number): {
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  label: string;
} {
  const absPercent = Math.abs(percentage);

  switch (trend) {
    case 'improving':
      return {
        icon: <TrendingUp className="w-4 h-4" />,
        color: 'text-emerald-600',
        bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
        label: `+${absPercent.toFixed(1)}%`,
      };
    case 'declining':
      return {
        icon: <TrendingDown className="w-4 h-4" />,
        color: 'text-rose-600',
        bgColor: 'bg-rose-100 dark:bg-rose-900/30',
        label: `-${absPercent.toFixed(1)}%`,
      };
    default:
      return {
        icon: <Minus className="w-4 h-4" />,
        color: 'text-slate-500',
        bgColor: 'bg-slate-100 dark:bg-slate-800',
        label: 'Stable',
      };
  }
}

/**
 * Get percentile color based on value
 */
function getPercentileColor(percentile: number | null): string {
  if (percentile === null) return 'text-slate-400';
  if (percentile >= 75) return 'text-emerald-600';
  if (percentile >= 50) return 'text-amber-600';
  if (percentile >= 25) return 'text-orange-600';
  return 'text-rose-600';
}

/**
 * Get percentile label
 */
function getPercentileLabel(percentile: number | null): string {
  if (percentile === null) return 'N/A';
  if (percentile >= 90) return 'Top 10%';
  if (percentile >= 75) return 'Top 25%';
  if (percentile >= 50) return 'Above Median';
  if (percentile >= 25) return 'Below Median';
  return 'Bottom 25%';
}

/**
 * Format measure name for display
 */
function formatMeasureName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Percentile position bar
 */
function PercentileBar({ percentile }: { percentile: number | null }) {
  if (percentile === null) {
    return (
      <div className="relative h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex items-center justify-center">
        <span className="text-[8px] text-slate-400">Insufficient peer data</span>
      </div>
    );
  }

  const position = Math.max(0, Math.min(100, percentile));

  return (
    <div className="relative h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
      <div className="absolute inset-y-0 left-0 flex w-full">
        <div className="bg-rose-300 dark:bg-rose-800" style={{ width: '25%' }} />
        <div className="bg-orange-300 dark:bg-orange-800" style={{ width: '25%' }} />
        <div className="bg-amber-300 dark:bg-amber-800" style={{ width: '25%' }} />
        <div className="bg-emerald-300 dark:bg-emerald-800" style={{ width: '25%' }} />
      </div>
      <motion.div
        initial={{ left: '50%' }}
        animate={{ left: `${position}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-violet-600 rounded-full transform -translate-x-1/2 border-2 border-white dark:border-slate-900 shadow"
      />
    </div>
  );
}

/**
 * Single measure row component
 */
function MeasureRow({
  name,
  measure,
  index,
}: {
  name: string;
  measure: MeasureScore;
  index: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const trendDisplay = getTrendDisplay(measure.trend, measure.trend_percentage);
  const percentileColor = getPercentileColor(measure.percentile);
  const higherBetter = isHigherBetter(name);

  // Calculate comparison to peer
  const vsPercentage =
    measure.peer_average !== 0
      ? ((measure.value - measure.peer_average) / measure.peer_average) * 100
      : 0;
  const isAbovePeer = vsPercentage > 0;
  const comparisonIsGood = higherBetter ? isAbovePeer : !isAbovePeer;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="border-b border-slate-100 dark:border-slate-800 last:border-0"
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors px-2 -mx-2 rounded"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
            {formatMeasureName(name)}
          </span>
          <span
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${trendDisplay.bgColor} ${trendDisplay.color}`}
          >
            {trendDisplay.icon}
            {trendDisplay.label}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-lg font-semibold text-slate-800 dark:text-slate-200">
              {formatMeasureValue(measure.value, name)}
            </span>
            <span className={`text-xs ml-2 ${percentileColor}`}>
              {measure.percentile !== null ? `${Math.round(measure.percentile)}th` : 'N/A'}
            </span>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>

      {isExpanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="pb-4 px-2"
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-4">
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
              <span className="text-slate-500 dark:text-slate-400 block text-xs mb-1">
                {getReportCardMonth().shortMonth} Value
              </span>
              <span className="text-slate-800 dark:text-slate-200 font-semibold">
                {formatMeasureValue(measure.value, name)}
              </span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
              <span className="text-slate-500 dark:text-slate-400 block text-xs mb-1">
                Peer {getReportCardMonth().shortMonth} Avg
              </span>
              <span className="text-slate-600 dark:text-slate-300 font-semibold">
                {formatMeasureValue(measure.peer_average, name)}
              </span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
              <span className="text-slate-500 dark:text-slate-400 block text-xs mb-1">
                vs Peers
              </span>
              <span
                className={`font-semibold ${comparisonIsGood ? 'text-emerald-600' : 'text-rose-600'}`}
              >
                {vsPercentage >= 0 ? '+' : ''}
                {vsPercentage.toFixed(0)}%
              </span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
              <span className="text-slate-500 dark:text-slate-400 block text-xs mb-1">
                Percentile
              </span>
              <span className={`font-semibold ${percentileColor}`}>
                {getPercentileLabel(measure.percentile)}
              </span>
            </div>
          </div>

          <div className="mb-2">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Your position among peers</span>
              <span className={percentileColor}>
                {measure.percentile !== null ? `${Math.round(measure.percentile)}th percentile` : 'N/A'}
              </span>
            </div>
            <PercentileBar percentile={measure.percentile} />
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

/**
 * Measure Breakdown Component
 * Displays a list of all measure values with expandable details
 */
export default function MeasureBreakdown({
  measureScores,
  className = '',
}: MeasureBreakdownProps) {
  const measures = Object.entries(measureScores);
  const { monthYear, shortMonth } = getReportCardMonth();

  // Sort by percentile (lowest first to highlight areas for improvement)
  // Null percentiles go to the end
  const sortedMeasures = [...measures].sort(([, a], [, b]) => {
    const aPercentile = a.percentile ?? 101; // Null values sort last
    const bPercentile = b.percentile ?? 101;
    return aPercentile - bPercentile;
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 ${className}`}
    >
      <div className="p-6 border-b border-slate-100 dark:border-slate-800">
        <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">
          {shortMonth} Performance Breakdown
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Your {monthYear} values vs peers • Click to expand • Sorted by percentile
        </p>
      </div>

      <div className="p-6">
        {sortedMeasures.length === 0 ? (
          <p className="text-center text-slate-500 dark:text-slate-400 py-8">
            No measure data available
          </p>
        ) : (
          <div className="space-y-0">
            {sortedMeasures.map(([name, measure], index) => (
              <MeasureRow key={name} name={name} measure={measure} index={index} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
