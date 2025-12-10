/**
 * Annual Review Calculator
 *
 * Calculates year-over-year comparisons, summary statistics, and forecasts
 * for annual review displays in report cards.
 */

import type {
  AnnualReview,
  MonthlyScore,
  YearOverYearComparison,
  MeasureYoYComparison,
  AnnualReviewSummary,
  AnnualForecast,
  MonthlyProjection,
  MeasureConfig,
} from '@/lib/types/report-card';
import { getLetterGrade } from '@/lib/utils/format-value';

/**
 * Annual review calculator for report card analytics.
 *
 * Provides pure calculation functions for annual review components.
 * Database queries and caching remain in the orchestrator.
 */
export class AnnualReviewCalculator {
  /**
   * Calculate year-over-year comparison from monthly scores
   *
   * @param monthlyScores - Array of monthly scores
   * @param currentYear - Current year for comparison
   * @returns YearOverYearComparison or null if insufficient data
   */
  calculateYearOverYear(
    monthlyScores: MonthlyScore[],
    currentYear: number
  ): YearOverYearComparison | null {
    // Use T00:00:00 suffix to parse in local time, not UTC
    const thisYearScores = monthlyScores.filter((m) => {
      const year = new Date(`${m.month}T00:00:00`).getFullYear();
      return year === currentYear;
    });
    const lastYearScores = monthlyScores.filter((m) => {
      const year = new Date(`${m.month}T00:00:00`).getFullYear();
      return year === currentYear - 1;
    });

    if (thisYearScores.length === 0 || lastYearScores.length === 0) {
      return null;
    }

    const thisYearAvg =
      thisYearScores.reduce((sum, m) => sum + m.score, 0) / thisYearScores.length;
    const lastYearAvg =
      lastYearScores.reduce((sum, m) => sum + m.score, 0) / lastYearScores.length;
    const changePercent =
      lastYearAvg > 0 ? ((thisYearAvg - lastYearAvg) / lastYearAvg) * 100 : 0;

    return {
      currentYear,
      previousYear: currentYear - 1,
      currentYearAverage: Math.round(thisYearAvg * 10) / 10,
      previousYearAverage: Math.round(lastYearAvg * 10) / 10,
      changePercent: Math.round(changePercent * 10) / 10,
      currentYearGrade: getLetterGrade(thisYearAvg),
      previousYearGrade: getLetterGrade(lastYearAvg),
      monthsCompared: Math.min(thisYearScores.length, lastYearScores.length),
    };
  }

  /**
   * Calculate per-measure year-over-year comparisons
   *
   * @param results - Array of database results with measure_scores
   * @param measures - Active measure configurations
   * @param currentYear - Current year for comparison
   * @returns Array of MeasureYoYComparison
   */
  calculateMeasureYoY(
    results: Array<{
      report_card_month: string;
      measure_scores: unknown;
    }>,
    measures: MeasureConfig[],
    currentYear: number
  ): MeasureYoYComparison[] {
    const measureYoY: MeasureYoYComparison[] = [];

    // Use T00:00:00 suffix to parse in local time, not UTC
    const thisYearResults = results.filter(
      (r) => new Date(`${r.report_card_month}T00:00:00`).getFullYear() === currentYear
    );
    const lastYearResults = results.filter(
      (r) => new Date(`${r.report_card_month}T00:00:00`).getFullYear() === currentYear - 1
    );

    if (thisYearResults.length === 0 || lastYearResults.length === 0) {
      return measureYoY;
    }

    for (const measure of measures) {
      const thisYearValues: number[] = [];
      for (const result of thisYearResults) {
        const measureScores = result.measure_scores as Record<string, { value: number }> | null;
        const measureScore = measureScores?.[measure.measure_name];
        if (measureScore?.value !== undefined) {
          thisYearValues.push(measureScore.value);
        }
      }

      const lastYearValues: number[] = [];
      for (const result of lastYearResults) {
        const measureScores = result.measure_scores as Record<string, { value: number }> | null;
        const measureScore = measureScores?.[measure.measure_name];
        if (measureScore?.value !== undefined) {
          lastYearValues.push(measureScore.value);
        }
      }

      if (thisYearValues.length > 0 && lastYearValues.length > 0) {
        const thisYearAvg =
          thisYearValues.reduce((sum, v) => sum + v, 0) / thisYearValues.length;
        const lastYearAvg =
          lastYearValues.reduce((sum, v) => sum + v, 0) / lastYearValues.length;
        const changePercent =
          lastYearAvg !== 0
            ? ((thisYearAvg - lastYearAvg) / Math.abs(lastYearAvg)) * 100
            : 0;
        const isPositiveChange = changePercent > 0;
        const improved = measure.higher_is_better ? isPositiveChange : !isPositiveChange;

        measureYoY.push({
          measureName: measure.measure_name,
          displayName: measure.display_name,
          previousYearAverage: Math.round(lastYearAvg * 100) / 100,
          currentYearAverage: Math.round(thisYearAvg * 100) / 100,
          changePercent: Math.round(changePercent * 10) / 10,
          improved,
          formatType: measure.format_type,
        });
      }
    }

    return measureYoY;
  }

  /**
   * Calculate summary statistics from monthly scores
   *
   * @param monthlyScores - Array of monthly scores
   * @returns AnnualReviewSummary with statistics and trend
   */
  calculateSummary(monthlyScores: MonthlyScore[]): AnnualReviewSummary {
    if (monthlyScores.length === 0) {
      return {
        averageScore: 0,
        highestScore: 0,
        lowestScore: 0,
        monthsAnalyzed: 0,
        trend: 'stable',
        improvementPercentage: 0,
      };
    }

    const scores = monthlyScores.map((m) => m.score);
    const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const highestScore = Math.max(...scores);
    const lowestScore = Math.min(...scores);

    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    let improvementPercentage = 0;

    if (monthlyScores.length >= 3) {
      const midpoint = Math.floor(scores.length / 2);
      const recentScores = scores.slice(0, midpoint);
      const olderScores = scores.slice(midpoint);
      const recentAvg =
        recentScores.length > 0
          ? recentScores.reduce((sum, s) => sum + s, 0) / recentScores.length
          : 0;
      const olderAvg =
        olderScores.length > 0
          ? olderScores.reduce((sum, s) => sum + s, 0) / olderScores.length
          : 0;

      if (olderAvg > 0) {
        const changePercent = ((recentAvg - olderAvg) / olderAvg) * 100;
        improvementPercentage = Math.round(changePercent * 10) / 10;
        if (changePercent >= 3) trend = 'improving';
        else if (changePercent <= -3) trend = 'declining';
      }
    }

    return {
      averageScore: Math.round(avgScore * 10) / 10,
      highestScore: Math.round(highestScore * 10) / 10,
      lowestScore: Math.round(lowestScore * 10) / 10,
      monthsAnalyzed: monthlyScores.length,
      trend,
      improvementPercentage,
    };
  }

  /**
   * Generate forecast based on recent trends
   *
   * @param monthlyScores - Array of monthly scores (most recent first)
   * @param currentYear - Current year for projections
   * @returns AnnualForecast or null if insufficient data
   */
  generateForecast(
    monthlyScores: MonthlyScore[],
    currentYear: number
  ): AnnualForecast | null {
    if (monthlyScores.length < 3) {
      return null;
    }

    const recentMonths = monthlyScores.slice(0, Math.min(6, monthlyScores.length));
    const firstMonth = recentMonths[0];
    const lastMonth = recentMonths[recentMonths.length - 1];

    if (!firstMonth || !lastMonth) {
      return null;
    }

    const avgRecentChange =
      recentMonths.length > 1
        ? (firstMonth.score - lastMonth.score) / (recentMonths.length - 1)
        : 0;

    const monthlyProjections: MonthlyProjection[] = [];
    // Use T00:00:00 suffix to parse in local time, not UTC
    const latestMonthDate = new Date(`${firstMonth.month}T00:00:00`);
    const currentYearEnd = new Date(currentYear, 11, 31);

    let projMonth = new Date(
      latestMonthDate.getFullYear(),
      latestMonthDate.getMonth() + 1,
      1
    );
    let cumulativeChange = 0;

    while (projMonth <= currentYearEnd && monthlyProjections.length < 6) {
      cumulativeChange += avgRecentChange;
      const projectedMonthScore = Math.min(
        100,
        Math.max(70, firstMonth.score + cumulativeChange)
      );

      monthlyProjections.push({
        month: `${projMonth.getFullYear()}-${String(projMonth.getMonth() + 1).padStart(2, '0')}-01`,
        monthLabel: projMonth.toLocaleDateString('en-US', {
          month: 'short',
          year: 'numeric',
        }),
        projectedScore: Math.round(projectedMonthScore * 10) / 10,
        projectedGrade: getLetterGrade(projectedMonthScore),
      });

      projMonth = new Date(projMonth.getFullYear(), projMonth.getMonth() + 1, 1);
    }

    const finalProjection = monthlyProjections[Math.min(2, monthlyProjections.length - 1)];
    const projectedScore =
      finalProjection?.projectedScore ??
      Math.min(100, Math.max(70, firstMonth.score + avgRecentChange * 3));
    const projectedGrade = getLetterGrade(projectedScore);

    return {
      projectedScore: Math.round(projectedScore * 10) / 10,
      projectedGrade,
      confidence:
        recentMonths.length >= 6 ? 'high' : recentMonths.length >= 3 ? 'medium' : 'low',
      basedOnMonths: recentMonths.length,
      projectionNote:
        avgRecentChange > 0
          ? 'Based on recent positive trends, score is projected to improve.'
          : avgRecentChange < 0
            ? 'Based on recent trends, focus on improvement is recommended.'
            : 'Score is projected to remain stable based on recent performance.',
      monthlyProjections,
    };
  }

  /**
   * Build complete annual review from database results
   *
   * Convenience method that orchestrates all calculation methods.
   * Does NOT handle database queries or caching - those remain in the service.
   *
   * @param practiceUid - Practice UID for the review
   * @param results - Raw database results
   * @param measures - Active measure configurations
   * @returns Complete AnnualReview object
   */
  buildAnnualReview(
    practiceUid: number,
    results: Array<{
      report_card_month: string;
      overall_score: string;
      percentile_rank: string;
      size_bucket: string;
      measure_scores: unknown;
    }>,
    measures: MeasureConfig[]
  ): AnnualReview {
    const currentYear = new Date().getFullYear();

    if (results.length === 0) {
      return {
        practiceUid,
        currentYear,
        monthlyScores: [],
        yearOverYear: null,
        measureYoY: [],
        summary: {
          averageScore: 0,
          highestScore: 0,
          lowestScore: 0,
          monthsAnalyzed: 0,
          trend: 'stable',
          improvementPercentage: 0,
        },
        forecast: null,
      };
    }

    // Calculate monthly scores with grades
    // Use T00:00:00 suffix to parse in local time, not UTC
    const monthlyScores: MonthlyScore[] = results.map((r) => {
      const score = parseFloat(r.overall_score || '0');
      return {
        month: r.report_card_month,
        monthLabel: new Date(`${r.report_card_month}T00:00:00`).toLocaleDateString('en-US', {
          month: 'short',
          year: 'numeric',
        }),
        score,
        grade: getLetterGrade(score),
        percentileRank: parseFloat(r.percentile_rank || '0'),
      };
    });

    return {
      practiceUid,
      currentYear,
      monthlyScores,
      yearOverYear: this.calculateYearOverYear(monthlyScores, currentYear),
      measureYoY: this.calculateMeasureYoY(results, measures, currentYear),
      summary: this.calculateSummary(monthlyScores),
      forecast: this.generateForecast(monthlyScores, currentYear),
    };
  }
}

/** Singleton instance */
export const annualReviewCalculator = new AnnualReviewCalculator();
