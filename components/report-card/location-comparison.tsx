'use client';

import { motion } from 'framer-motion';
import { MapPin, Trophy, Medal, Award, ChevronRight } from 'lucide-react';
import type { LocationComparison, LocationMetrics } from '@/lib/types/report-card';

interface LocationComparisonPanelProps {
  comparison: LocationComparison;
  className?: string;
}

/**
 * Get rank icon based on position
 */
function getRankIcon(rank: number): React.ReactNode {
  switch (rank) {
    case 1:
      return <Trophy className="w-5 h-5 text-amber-500" />;
    case 2:
      return <Medal className="w-5 h-5 text-slate-400" />;
    case 3:
      return <Award className="w-5 h-5 text-amber-700" />;
    default:
      return <span className="w-5 h-5 flex items-center justify-center text-sm font-bold text-slate-500">#{rank}</span>;
  }
}

/**
 * Get rank badge color
 */
function getRankBadgeClass(rank: number): string {
  switch (rank) {
    case 1:
      return 'bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800';
    case 2:
      return 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
    case 3:
      return 'bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900';
    default:
      return 'bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-800';
  }
}

/**
 * Format metric name for display
 */
function formatMetricName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Format metric value based on name hints
 */
function formatMetricValue(name: string, value: number): string {
  if (name.includes('rate') || name.includes('percentage')) {
    return `${value.toFixed(1)}%`;
  }
  if (name.includes('charges') || name.includes('payment') || name.includes('ar')) {
    return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/**
 * Single location card
 */
function LocationCard({
  location,
  practiceTotal,
  index,
}: {
  location: LocationMetrics;
  practiceTotal: Record<string, number>;
  index: number;
}) {
  const metricNames = Object.keys(location.metrics).slice(0, 4); // Show top 4 metrics

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={`rounded-xl border p-4 ${getRankBadgeClass(location.rank)}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {getRankIcon(location.rank)}
          <div>
            <h4 className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-slate-400" />
              {location.location}
            </h4>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Rank #{location.rank}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {metricNames.map((metric) => {
          const value = location.metrics[metric] || 0;
          const total = practiceTotal[metric] || 0;
          const percentage = total > 0 ? (value / total) * 100 : 0;

          return (
            <div key={metric} className="bg-white/50 dark:bg-slate-800/50 rounded-lg p-2">
              <span className="text-xs text-slate-500 dark:text-slate-400 block truncate">
                {formatMetricName(metric)}
              </span>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {formatMetricValue(metric, value)}
              </span>
              {total > 0 && (
                <span className="text-xs text-slate-400 block">
                  ({percentage.toFixed(0)}% of total)
                </span>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

/**
 * Location Comparison Panel Component
 * Displays location rankings and metrics comparison within a practice
 */
export default function LocationComparisonPanel({
  comparison,
  className = '',
}: LocationComparisonPanelProps) {
  // Sort locations by rank
  const sortedLocations = [...comparison.locations].sort((a, b) => a.rank - b.rank);
  const topPerformer = sortedLocations[0];
  const hasMultipleLocations = sortedLocations.length > 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5 }}
      className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 ${className}`}
    >
      <div className="p-6 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">
              Location Performance
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Compare performance across your locations
            </p>
          </div>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {sortedLocations.length} location{sortedLocations.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="p-6">
        {sortedLocations.length === 0 ? (
          <div className="text-center py-8">
            <MapPin className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 dark:text-slate-400">
              No location data available
            </p>
          </div>
        ) : (
          <>
            {/* Top performer highlight */}
            {topPerformer && hasMultipleLocations && (
              <div className="mb-6 p-4 bg-gradient-to-r from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-900/10 rounded-xl border border-amber-200 dark:border-amber-800/50">
                <div className="flex items-center gap-3">
                  <Trophy className="w-8 h-8 text-amber-500" />
                  <div>
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-medium block">
                      TOP PERFORMER
                    </span>
                    <span className="text-lg font-semibold text-amber-800 dark:text-amber-200">
                      {topPerformer.location}
                    </span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-amber-400 ml-auto" />
                </div>
              </div>
            )}

            {/* Location grid */}
            <div className="grid gap-4 md:grid-cols-2">
              {sortedLocations.map((location, index) => (
                <LocationCard
                  key={location.location}
                  location={location}
                  practiceTotal={comparison.practice_totals}
                  index={index}
                />
              ))}
            </div>

            {/* Practice totals summary */}
            {Object.keys(comparison.practice_totals).length > 0 && (
              <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                <h4 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-3">
                  Practice Totals
                </h4>
                <div className="flex flex-wrap gap-4">
                  {Object.entries(comparison.practice_totals)
                    .slice(0, 4)
                    .map(([metric, value]) => (
                      <div key={metric} className="text-sm">
                        <span className="text-slate-500 dark:text-slate-400">
                          {formatMetricName(metric)}:
                        </span>{' '}
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {formatMetricValue(metric, value)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}


