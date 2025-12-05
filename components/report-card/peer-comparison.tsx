'use client';

import { motion } from 'framer-motion';
import { Users, ArrowUp, ArrowDown, Minus, ChevronDown, Loader2, AlertTriangle } from 'lucide-react';
import type { PeerComparison, MeasureScore } from '@/lib/types/report-card';
import type { SizeBucket } from '@/lib/constants/report-card';
import { SIZE_BUCKETS } from '@/lib/constants/report-card';
import { formatMeasureValue, isHigherBetter, getReportCardMonth } from '@/lib/utils/format-value';

/** Minimum number of peers required for meaningful comparison */
const MIN_PEERS_FOR_COMPARISON = 2;

interface PeerComparisonPanelProps {
  comparison: PeerComparison;
  practiceValues: Record<string, number>;
  practiceScores: Record<string, number>;
  measureScores?: Record<string, MeasureScore>;
  practiceBucket: SizeBucket;
  selectedBucket?: SizeBucket | undefined;
  onBucketChange?: (bucket: SizeBucket | undefined) => void;
  isLoadingPeer?: boolean;
  className?: string;
}

/**
 * Format size bucket for display
 */
function formatSizeBucket(bucket: SizeBucket): string {
  switch (bucket) {
    case 'small':
      return 'Small';
    case 'medium':
      return 'Medium';
    case 'large':
      return 'Large';
    case 'xlarge':
      return 'Extra Large';
    case 'xxlarge':
      return 'Enterprise';
    default:
      return bucket;
  }
}

/**
 * Format measure name for display
 */
function formatMeasureName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Get comparison indicator based on actual values
 */
function getComparisonIndicator(
  practiceValue: number,
  peerAverage: number,
  higherIsBetter = true
): {
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  label: string;
  isGood: boolean;
  percentDiff: number;
} {
  if (peerAverage === 0) {
    return {
      icon: <Minus className="w-5 h-5" />,
      color: 'text-slate-400',
      bgColor: 'bg-slate-100 dark:bg-slate-800',
      label: 'No peer data',
      isGood: true,
      percentDiff: 0,
    };
  }

  const percentDiff = ((practiceValue - peerAverage) / peerAverage) * 100;

  // Within 5% is considered "on par"
  if (Math.abs(percentDiff) < 5) {
    return {
      icon: <Minus className="w-5 h-5" />,
      color: 'text-slate-500',
      bgColor: 'bg-slate-100 dark:bg-slate-800',
      label: 'On par with peers',
      isGood: true,
      percentDiff,
    };
  }

  const isAbove = percentDiff > 0;
  const isGood = higherIsBetter ? isAbove : !isAbove;

  if (isAbove) {
    return {
      icon: <ArrowUp className="w-5 h-5" />,
      color: isGood ? 'text-emerald-600' : 'text-rose-600',
      bgColor: isGood ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-rose-100 dark:bg-rose-900/30',
      label: `${Math.abs(percentDiff).toFixed(0)}% above peers`,
      isGood,
      percentDiff,
    };
  }

  return {
    icon: <ArrowDown className="w-5 h-5" />,
    color: isGood ? 'text-emerald-600' : 'text-rose-600',
    bgColor: isGood ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-rose-100 dark:bg-rose-900/30',
    label: `${Math.abs(percentDiff).toFixed(0)}% below peers`,
    isGood,
    percentDiff,
  };
}

/**
 * Percentile bar component - uses normalized scores for positioning
 */
function PercentileBar({ percentileRank }: { percentileRank: number }) {
  // Percentile rank is already 0-100
  const position = Math.max(0, Math.min(100, percentileRank));

  return (
    <div className="relative h-3 mt-3">
      {/* Percentile ranges background */}
      <div className="absolute inset-y-0 left-0 right-0 flex rounded-full overflow-hidden">
        <div className="bg-rose-200 dark:bg-rose-900/40" style={{ width: '25%' }} />
        <div className="bg-amber-200 dark:bg-amber-900/40" style={{ width: '25%' }} />
        <div className="bg-teal-200 dark:bg-teal-900/40" style={{ width: '25%' }} />
        <div className="bg-emerald-200 dark:bg-emerald-900/40" style={{ width: '25%' }} />
      </div>

      {/* Practice position marker */}
      <motion.div
        initial={{ left: '50%' }}
        animate={{ left: `${position}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-violet-600 rounded-full transform -translate-x-1/2 shadow-lg border-2 border-white dark:border-slate-900"
      />

      {/* Labels */}
      <div className="absolute -bottom-4 left-0 right-0 flex justify-between text-[10px] text-slate-400">
        <span>0</span>
        <span className="absolute left-1/4 -translate-x-1/2">25th</span>
        <span className="absolute left-1/2 -translate-x-1/2">50th</span>
        <span className="absolute left-3/4 -translate-x-1/2">75th</span>
        <span>100th</span>
      </div>
    </div>
  );
}

/**
 * Individual measure card component
 */
function MeasureCard({
  measure,
  practiceValue,
  peerAverage,
  percentileRank,
  peerCount,
  percentiles,
  index,
}: {
  measure: string;
  practiceValue: number;
  peerAverage: number;
  percentileRank: number | null;
  peerCount: number;
  percentiles: { p25: number; p50: number; p75: number };
  index: number;
}) {
  const higherBetter = isHigherBetter(measure);
  const hasInsufficientPeers = peerCount < MIN_PEERS_FOR_COMPARISON;
  const indicator = hasInsufficientPeers 
    ? {
        icon: <AlertTriangle className="w-5 h-5" />,
        color: 'text-amber-600',
        bgColor: 'bg-amber-100 dark:bg-amber-900/30',
        label: 'Limited peer data',
        isGood: true,
        percentDiff: 0,
      }
    : getComparisonIndicator(practiceValue, peerAverage, higherBetter);
  const difference = practiceValue - peerAverage;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.4 }}
      className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
          {formatMeasureName(measure)}
        </h4>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${indicator.bgColor}`}>
          <span className={indicator.color}>{indicator.icon}</span>
          <span className={`text-sm font-medium ${indicator.color}`}>
            {indicator.label}
          </span>
        </div>
      </div>

      {/* Insufficient peers warning */}
      {hasInsufficientPeers && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4 inline mr-1.5" />
            Only {peerCount} peer{peerCount !== 1 ? 's' : ''} in this size group. 
            Percentile rankings require at least {MIN_PEERS_FOR_COMPARISON} peers for meaningful comparison.
          </p>
        </div>
      )}

      {/* Values Grid */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
          <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
            Your Value
          </span>
          <span className="text-xl font-bold text-slate-800 dark:text-slate-200">
            {formatMeasureValue(practiceValue, measure)}
          </span>
        </div>
        <div className="text-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
          <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
            Peer Average
          </span>
          <span className={`text-xl font-bold ${hasInsufficientPeers ? 'text-slate-400' : 'text-slate-600 dark:text-slate-400'}`}>
            {hasInsufficientPeers ? 'N/A' : formatMeasureValue(peerAverage, measure)}
          </span>
        </div>
        <div className="text-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
          <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
            Difference
          </span>
          <span
            className={`text-xl font-bold ${hasInsufficientPeers ? 'text-slate-400' : (indicator.isGood ? 'text-emerald-600' : 'text-rose-600')}`}
          >
            {hasInsufficientPeers ? 'N/A' : (
              <>
                {difference >= 0 ? '+' : ''}
                {formatMeasureValue(difference, measure)}
              </>
            )}
          </span>
        </div>
      </div>

      {/* Percentile Position */}
      <div className="mb-2">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="text-slate-500 dark:text-slate-400">Your Percentile Rank</span>
          <span className={`font-semibold ${hasInsufficientPeers ? 'text-slate-400' : 'text-violet-600 dark:text-violet-400'}`}>
            {percentileRank !== null ? `${Math.round(percentileRank)}th percentile` : 'N/A'}
          </span>
        </div>
        {!hasInsufficientPeers && percentileRank !== null && (
          <PercentileBar percentileRank={percentileRank} />
        )}
        {hasInsufficientPeers && (
          <div className="h-3 mt-3 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
            <span className="text-[10px] text-slate-400">Insufficient data</span>
          </div>
        )}
      </div>

      {/* Peer Distribution */}
      <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-800">
        <span className="text-xs text-slate-500 dark:text-slate-400 block mb-2">
          Peer Distribution {peerCount > 0 && `(${peerCount} peer${peerCount !== 1 ? 's' : ''})`}
        </span>
        {hasInsufficientPeers ? (
          <p className="text-xs text-slate-400 italic">
            Distribution data unavailable with limited peers
          </p>
        ) : (
          <div className="flex justify-between text-xs">
            <div className="text-center">
              <span className="text-slate-400 block">25th</span>
              <span className="font-medium text-slate-600 dark:text-slate-300">
                {formatMeasureValue(percentiles.p25, measure)}
              </span>
            </div>
            <div className="text-center">
              <span className="text-slate-400 block">Median</span>
              <span className="font-medium text-slate-600 dark:text-slate-300">
                {formatMeasureValue(percentiles.p50, measure)}
              </span>
            </div>
            <div className="text-center">
              <span className="text-slate-400 block">75th</span>
              <span className="font-medium text-slate-600 dark:text-slate-300">
                {formatMeasureValue(percentiles.p75, measure)}
              </span>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Bucket selector dropdown component
 */
function BucketSelector({
  practiceBucket,
  selectedBucket,
  practiceCount,
  onBucketChange,
  isLoading,
}: {
  practiceBucket: SizeBucket;
  selectedBucket: SizeBucket | undefined;
  practiceCount: number;
  onBucketChange: ((bucket: SizeBucket | undefined) => void) | undefined;
  isLoading: boolean | undefined;
}) {
  const effectiveBucket = selectedBucket ?? practiceBucket;
  const isViewingOwnBucket = !selectedBucket || selectedBucket === practiceBucket;

  return (
    <div className="flex items-center gap-3">
      {/* Bucket selector dropdown */}
      <div className="relative">
        <select
          value={effectiveBucket}
          onChange={(e) => {
            const newBucket = e.target.value as SizeBucket;
            // If selecting own bucket, clear override to use default
            onBucketChange?.(newBucket === practiceBucket ? undefined : newBucket);
          }}
          disabled={isLoading}
          className="appearance-none bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 
                     pl-10 pr-8 py-2 rounded-lg font-medium text-sm cursor-pointer
                     border border-violet-200 dark:border-violet-800 
                     hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors
                     focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {SIZE_BUCKETS.map((bucket) => (
            <option key={bucket} value={bucket}>
              {formatSizeBucket(bucket)}
              {bucket === practiceBucket ? ' (Your Size)' : ''}
            </option>
          ))}
        </select>
        <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-violet-600 dark:text-violet-400 pointer-events-none" />
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-violet-600 dark:text-violet-400 pointer-events-none" />
      </div>

      {/* Practice count badge */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
        practiceCount <= MIN_PEERS_FOR_COMPARISON 
          ? 'bg-amber-100 dark:bg-amber-900/30' 
          : 'bg-slate-100 dark:bg-slate-800'
      }`}>
        {isLoading ? (
          <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
        ) : (
          <>
            {practiceCount <= MIN_PEERS_FOR_COMPARISON && (
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            )}
            <span className={`text-sm font-medium ${
              practiceCount <= MIN_PEERS_FOR_COMPARISON
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-slate-600 dark:text-slate-400'
            }`}>
              {practiceCount} practice{practiceCount !== 1 ? 's' : ''}
            </span>
          </>
        )}
      </div>

      {/* Indicator when viewing different bucket */}
      {!isViewingOwnBucket && (
        <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-1 rounded">
          Comparing to different size group
        </span>
      )}
    </div>
  );
}

/**
 * Peer Comparison Panel Component
 * Displays individual cards for each measure comparison
 */
export default function PeerComparisonPanel({
  comparison,
  practiceValues,
  practiceScores,
  measureScores,
  practiceBucket,
  selectedBucket,
  onBucketChange,
  isLoadingPeer,
  className = '',
}: PeerComparisonPanelProps) {
  const measures = Object.keys(comparison.averages);
  const { monthYear } = getReportCardMonth();
  const effectiveBucket = selectedBucket ?? practiceBucket;

  return (
    <div className={className}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6"
      >
        <div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200">
            {monthYear} Peer Comparison
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            How you ranked vs similar-sized practices
          </p>
        </div>
        <BucketSelector
          practiceBucket={practiceBucket}
          selectedBucket={selectedBucket}
          practiceCount={comparison.practice_count}
          onBucketChange={onBucketChange}
          isLoading={isLoadingPeer}
        />
      </motion.div>

      {/* Measure Cards Grid */}
      {measures.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center">
          <p className="text-slate-500 dark:text-slate-400">
            No peer comparison data available for {formatSizeBucket(effectiveBucket)} practices
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {measures.map((measure, index) => {
            const practiceValue = practiceValues[measure] ?? 0;
            const peerAverage = comparison.averages[measure] ?? 0;
            const measureScore = measureScores?.[measure];
            const percentileRank = measureScore?.percentile ?? practiceScores[measure] ?? null;
            const peerCount = measureScore?.peer_count ?? comparison.practice_count - 1;
            const percentiles = comparison.percentiles[measure] ?? {
              p25: 0,
              p50: 0,
              p75: 0,
            };

            return (
              <MeasureCard
                key={measure}
                measure={measure}
                practiceValue={practiceValue}
                peerAverage={peerAverage}
                percentileRank={percentileRank}
                peerCount={peerCount}
                percentiles={percentiles}
                index={index}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
