/**
 * Shared Trend Calculation Utilities
 *
 * Provides unified trend calculation logic used by both:
 * - TrendAnalysisService (CLI/cron for populating report_card_trends)
 * - ReportCardGeneratorService (real-time scoring)
 *
 * This ensures consistent trend direction and percentage calculations
 * across the system.
 */

import { TREND_THRESHOLDS, type TrendDirection } from '@/lib/constants/report-card';

export interface TrendCalculationResult {
  direction: TrendDirection;
  percentage: number;
}

export interface TrendCalculationInput {
  currentValue: number;
  priorValues: number[];
  higherIsBetter: boolean;
}

/**
 * Calculate trend direction and percentage from values
 *
 * @param input - Current value, prior values array, and higherIsBetter flag
 * @returns TrendCalculationResult with direction and percentage
 *
 * @example
 * // Charges (higher is better): $100K current vs $80K avg prior
 * calculateTrend({ currentValue: 100000, priorValues: [80000], higherIsBetter: true });
 * // Returns: { direction: 'improving', percentage: 25 }
 *
 * @example
 * // Cancellation Rate (lower is better): 5% current vs 10% avg prior
 * calculateTrend({ currentValue: 5, priorValues: [10], higherIsBetter: false });
 * // Returns: { direction: 'improving', percentage: -50 }
 * // (negative % but improving because lower is better)
 *
 * @remarks
 * - Returns { direction: 'stable', percentage: 0 } if no prior values
 * - Returns { direction: 'stable', percentage: 0 } if prior average is 0
 * - Percentage is capped at ±99999.99 for database storage
 * - Direction considers higherIsBetter: for measures where lower is better,
 *   a negative percentage change is "improving"
 */
export function calculateTrend(input: TrendCalculationInput): TrendCalculationResult {
  const { currentValue, priorValues, higherIsBetter } = input;

  if (priorValues.length === 0) {
    return { direction: 'stable', percentage: 0 };
  }

  const priorAverage = priorValues.reduce((sum, v) => sum + v, 0) / priorValues.length;

  if (priorAverage === 0) {
    return { direction: 'stable', percentage: 0 };
  }

  // Calculate raw percentage change
  const rawPercentage = ((currentValue - priorAverage) / Math.abs(priorAverage)) * 100;

  // Cap to database limits
  const cappedPercentage = Math.max(-99999.99, Math.min(99999.99, rawPercentage));
  const roundedPercentage = Math.round(cappedPercentage * 100) / 100;

  // Determine direction considering higherIsBetter
  const direction = determineTrendDirection(roundedPercentage, higherIsBetter);

  return {
    direction,
    percentage: roundedPercentage,
  };
}

/**
 * Determine trend direction based on percentage change and measure polarity
 *
 * @param percentageChange - The calculated percentage change
 * @param higherIsBetter - Whether higher values are better for this measure
 * @returns TrendDirection: 'improving', 'declining', or 'stable'
 *
 * @remarks
 * Uses TREND_THRESHOLDS constants for consistency:
 * - Changes ≥ IMPROVING_MIN_PERCENT (5%) are significant
 * - Changes ≤ DECLINING_MIN_PERCENT (-5%) are significant
 * - Changes between -5% and +5% are considered 'stable'
 *
 * For measures where lower is better (higherIsBetter=false):
 * - Negative percentage (value went down) = 'improving'
 * - Positive percentage (value went up) = 'declining'
 */
export function determineTrendDirection(
  percentageChange: number,
  higherIsBetter: boolean
): TrendDirection {
  const absChange = Math.abs(percentageChange);

  // If change is within threshold, it's stable
  if (absChange < TREND_THRESHOLDS.IMPROVING_MIN_PERCENT) {
    return 'stable';
  }

  const isPositiveChange = percentageChange > 0;

  // Determine direction based on higherIsBetter
  if (higherIsBetter) {
    // Higher is better: positive change = improving, negative = declining
    return isPositiveChange ? 'improving' : 'declining';
  } else {
    // Lower is better: positive change = declining, negative = improving
    return isPositiveChange ? 'declining' : 'improving';
  }
}


