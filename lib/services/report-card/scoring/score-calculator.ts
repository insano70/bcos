/**
 * Score Calculator
 *
 * Core scoring logic for report card generation.
 * Handles percentile calculations, trend scoring, and insight generation.
 */

import type {
  MeasureScoringResult,
  MonthStatisticsMap,
  PeerStatisticsMap,
  TrendDataMap,
  IScoreCalculator,
} from '../types';
import type { MeasureConfig } from '@/lib/types/report-card';
import type { SizeBucket, TrendDirection } from '@/lib/constants/report-card';
import { SCORE_TRANSFORMATION, SCORE_WEIGHTS } from '@/lib/constants/report-card';
import { calculateTrend } from '@/lib/utils/trend-calculation';

/**
 * Score calculator for report card measure scoring.
 *
 * Implements the IScoreCalculator interface for testability
 * and dependency injection.
 */
export class ScoreCalculator implements IScoreCalculator {
  /**
   * Calculate percentile rank for a value within a distribution
   *
   * Returns the percentage of values in the distribution that are worse than
   * the given value. "Worse" is determined by the higherIsBetter parameter.
   *
   * @param value - The value to calculate percentile for
   * @param allValues - Array of all peer values to compare against
   * @param higherIsBetter - If true, higher values are better (e.g., charges);
   *                         if false, lower values are better (e.g., cancellation rate)
   * @returns Percentile rank (0-100), where 100 means better than all peers
   *
   * @example
   * // Higher is better: 80 is better than 70 and 75
   * calculatePercentile(80, [70, 75, 80, 90], true) // → 50 (better than 2/4 = 50%)
   *
   * @example
   * // Lower is better: 5% cancellation is better than 10%
   * calculatePercentile(5, [5, 10, 15], false) // → 66.7 (better than 2/3)
   */
  calculatePercentile(value: number, allValues: number[], higherIsBetter: boolean): number {
    if (allValues.length === 0) return 50;

    const countBelow = allValues.filter((v) =>
      higherIsBetter ? v < value : v > value
    ).length;

    return (countBelow / allValues.length) * 100;
  }

  /**
   * Calculate trend score from trend percentage
   *
   * Converts trend percentage to a 70-100 scale:
   * - -50% or worse → 70 (C-, floor)
   * - 0% (no change) → 85 (B-, neutral)
   * - +50% or better → 100 (A+, ceiling)
   *
   * Linear interpolation between these points.
   */
  calculateTrendScore(trendPercentage: number): number {
    const { FLOOR, RANGE } = SCORE_TRANSFORMATION;
    const { MAX_TREND_PERCENT } = SCORE_WEIGHTS;

    // Clamp trend percentage to max range (-50% to +50%)
    const clampedTrend = Math.max(-MAX_TREND_PERCENT, Math.min(MAX_TREND_PERCENT, trendPercentage));

    // Convert from -50..+50 to 0..100 scale
    // -50% → 0, 0% → 50, +50% → 100
    const normalizedTrend = ((clampedTrend + MAX_TREND_PERCENT) / (2 * MAX_TREND_PERCENT)) * 100;

    // Transform to grading scale (70-100)
    return FLOOR + (normalizedTrend / 100) * RANGE;
  }

  /**
   * Normalize score using weighted composite of peer and trend scores
   *
   * WEIGHTED COMPOSITE SCORING:
   * Final score is a weighted average of peer score and trend score:
   * - Peer Score: Based on percentile rank (0-100 → 70-100)
   * - Trend Score: Based on improvement percentage (-50% to +50% → 70-100)
   *
   * Default weights (configurable in SCORE_WEIGHTS):
   * - Peer: 50%
   * - Trend: 50%
   *
   * This balances:
   * - Current performance vs peers
   * - Improvement trajectory over time
   *
   * IMPORTANT: For measures where lower is better (e.g., Cancellation Rate),
   * the trend percentage is inverted so that a decrease (negative %) is treated
   * as an improvement for scoring purposes.
   */
  normalizeScore(
    percentileRank: number,
    _trend: TrendDirection,
    higherIsBetter: boolean,
    trendPercentage: number = 0
  ): number {
    const { FLOOR, RANGE } = SCORE_TRANSFORMATION;
    const { PEER_WEIGHT, TREND_WEIGHT } = SCORE_WEIGHTS;

    // Calculate peer score from percentile (70-100)
    const peerScore = FLOOR + (percentileRank / 100) * RANGE;

    // For measures where lower is better, invert the trend percentage
    // This ensures that a decrease (which is good for these measures) gets rewarded
    const effectiveTrendPercentage = higherIsBetter ? trendPercentage : -trendPercentage;

    // Calculate trend score from effective trend percentage (70-100)
    const trendScore = this.calculateTrendScore(effectiveTrendPercentage);

    // Weighted composite
    const finalScore = peerScore * PEER_WEIGHT + trendScore * TREND_WEIGHT;

    // Ensure within bounds and round to 1 decimal
    return Math.round(Math.max(FLOOR, Math.min(100, finalScore)) * 10) / 10;
  }

  /**
   * Calculate overall weighted score from measure results
   */
  calculateOverallScore(results: MeasureScoringResult[], measures: MeasureConfig[]): number {
    let totalWeight = 0;
    let weightedSum = 0;

    for (const result of results) {
      const measure = measures.find((m) => m.measure_name === result.measureName);
      const weight = measure?.weight || 5;

      totalWeight += weight;
      weightedSum += result.normalizedScore * weight;
    }

    if (totalWeight === 0) return 0;

    return Math.round((weightedSum / totalWeight) * 10) / 10;
  }

  /**
   * Score a single measure using preloaded data
   *
   * No database queries - all data comes from preloaded maps.
   */
  scoreMeasure(
    practiceUid: number,
    measure: MeasureConfig,
    sizeBucket: SizeBucket,
    targetMonth: string,
    monthStats: MonthStatisticsMap,
    peerStats: PeerStatisticsMap,
    trendDataMap: TrendDataMap
  ): MeasureScoringResult | null {
    // Get practice's value for this measure/month
    const statsKey = `${practiceUid}:${measure.measure_name}`;
    const rawValue = monthStats.get(statsKey);

    if (rawValue === undefined) {
      return null;
    }

    // Get peer statistics (excluding current practice)
    const peerKey = `${sizeBucket}:${measure.measure_name}`;
    const peerData = peerStats.get(peerKey);

    // Calculate peer values excluding current practice
    let peerValues: number[] = [];
    let peerAverage = 0;
    let peerCount = 0;

    if (peerData) {
      // Build values array excluding current practice
      peerValues = [];
      for (const [uid, val] of Array.from(peerData.practiceValues.entries())) {
        if (uid !== practiceUid) {
          peerValues.push(val);
        }
      }

      peerCount = peerValues.length;
      peerAverage =
        peerCount > 0 ? peerValues.reduce((sum: number, v: number) => sum + v, 0) / peerCount : 0;
    }

    // Calculate percentile rank (null if insufficient peers)
    const percentileRank =
      peerCount >= 2 ? this.calculatePercentile(rawValue, peerValues, measure.higher_is_better) : null;

    // Calculate trend from preloaded data
    const trendResult = this.calculateTrend(practiceUid, measure, targetMonth, trendDataMap);

    // Normalize score using weighted composite of peer percentile and trend
    const effectivePercentile = percentileRank ?? 50;
    const normalizedScore = this.normalizeScore(
      effectivePercentile,
      trendResult.direction,
      measure.higher_is_better,
      trendResult.percentage
    );

    return {
      measureName: measure.measure_name,
      rawValue,
      normalizedScore,
      percentileRank: percentileRank ?? null,
      peerAverage,
      peerCount,
      trend: trendResult.direction,
      trendPercentage: trendResult.percentage,
    };
  }

  /**
   * Calculate trend from preloaded data
   *
   * Uses shared trend calculation utility for consistency with TrendAnalysisService.
   * NOTE: Fixed parameter name from _practiceUid to practiceUid.
   */
  calculateTrend(
    practiceUid: number,
    measure: MeasureConfig,
    targetMonth: string,
    trendDataMap: TrendDataMap
  ): { direction: TrendDirection; percentage: number } {
    const key = `${practiceUid}:${measure.measure_name}`;
    const data = trendDataMap.get(key);

    if (!data || data.length === 0) {
      return { direction: 'stable', percentage: 0 };
    }

    // Use T00:00:00 suffix to parse in local time, not UTC
    const targetDate = new Date(`${targetMonth}T00:00:00`);
    const targetMonthStart = targetDate.getTime();
    const targetMonthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 1).getTime();

    // Find target month value
    const targetValue = data.find((d) => {
      const t = d.date.getTime();
      return t >= targetMonthStart && t < targetMonthEnd;
    })?.value;

    if (targetValue === undefined) {
      return { direction: 'stable', percentage: 0 };
    }

    // Find prior 3 months values
    const priorEnd = targetDate.getTime();
    const priorStart = new Date(targetDate.getFullYear(), targetDate.getMonth() - 3, 1).getTime();

    const priorValues = data
      .filter((d) => {
        const t = d.date.getTime();
        return t >= priorStart && t < priorEnd;
      })
      .map((d) => d.value);

    if (priorValues.length === 0) {
      return { direction: 'stable', percentage: 0 };
    }

    // Use shared trend calculation utility for consistency
    const trendResult = calculateTrend({
      currentValue: targetValue,
      priorValues,
      higherIsBetter: measure.higher_is_better,
    });

    return {
      direction: trendResult.direction,
      percentage: trendResult.percentage,
    };
  }

  /**
   * Generate human-readable insights from scoring results
   */
  generateInsights(results: MeasureScoringResult[], measures: MeasureConfig[]): string[] {
    const insights: string[] = [];

    // Find top and bottom performers
    const sorted = [...results].sort((a, b) => b.normalizedScore - a.normalizedScore);

    const top = sorted[0];
    if (top) {
      const topMeasure = measures.find((m) => m.measure_name === top.measureName);
      const percentileText =
        top.percentileRank !== null ? ` (${Math.round(top.percentileRank)}th percentile)` : '';
      insights.push(
        `Strongest performance in ${topMeasure?.display_name ?? top.measureName}${percentileText}`
      );
    }

    if (sorted.length > 1) {
      const bottom = sorted[sorted.length - 1];
      if (bottom && bottom.normalizedScore < 50) {
        const bottomMeasure = measures.find((m) => m.measure_name === bottom.measureName);
        const percentileText =
          bottom.percentileRank !== null ? ` (${Math.round(bottom.percentileRank)}th percentile)` : '';
        insights.push(
          `Opportunity for improvement in ${bottomMeasure?.display_name ?? bottom.measureName}${percentileText}`
        );
      }
    }

    // Highlight improving trends
    const improving = results.filter((r) => r.trend === 'improving');
    if (improving.length > 0) {
      const names = improving
        .map((r) => {
          const m = measures.find((m) => m.measure_name === r.measureName);
          return m?.display_name || r.measureName;
        })
        .join(', ');
      insights.push(`Positive trends in ${names}`);
    }

    // Highlight declining trends
    const declining = results.filter((r) => r.trend === 'declining');
    if (declining.length > 0) {
      const names = declining
        .map((r) => {
          const m = measures.find((m) => m.measure_name === r.measureName);
          return m?.display_name || r.measureName;
        })
        .join(', ');
      insights.push(`Watch for declining trends in ${names}`);
    }

    return insights;
  }
}

/** Singleton instance */
export const scoreCalculator = new ScoreCalculator();
