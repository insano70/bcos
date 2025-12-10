/**
 * Report Card Result Mapper
 *
 * Maps database rows to domain objects.
 * Centralizes all result transformation logic.
 */

import type { ReportCard, GradeHistoryEntry, MonthlyScore, SizeBucket } from '@/lib/types/report-card';
import type { report_card_results } from '@/lib/db/schema';
import { getLetterGrade, compareGrades } from '@/lib/utils/format-value';

/**
 * Format a month string (YYYY-MM-01) to a human-readable label (e.g., "Nov 2025")
 * Uses T00:00:00 suffix to parse in local time, not UTC
 */
function formatMonthLabel(monthString: string): string {
  // Use T00:00:00 suffix to parse in local time, not UTC
  const date = new Date(`${monthString}T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/**
 * Result mapper for report card data transformations.
 *
 * Provides consistent mapping between database rows and domain objects
 * used throughout the report card service layer.
 */
export class ResultMapper {
  /**
   * Map database result to ReportCard domain object
   *
   * Centralizes all result transformation logic to ensure consistency
   * across getReportCardByOrganization and getReportCardByOrganizationAndMonth.
   *
   * @param result - Raw database result from report_card_results table
   * @returns Fully mapped ReportCard object
   */
  mapDbResultToReportCard(result: typeof report_card_results.$inferSelect): ReportCard {
    return {
      result_id: result.result_id,
      practice_uid: result.practice_uid,
      organization_id: result.organization_id,
      report_card_month: result.report_card_month,
      generated_at: result.generated_at?.toISOString() || new Date().toISOString(),
      overall_score: parseFloat(result.overall_score || '0'),
      size_bucket: (result.size_bucket as SizeBucket) || 'medium',
      percentile_rank: parseFloat(result.percentile_rank || '0'),
      insights: (result.insights as string[]) || [],
      measure_scores: (result.measure_scores as Record<string, ReportCard['measure_scores'][string]>) || {},
    };
  }

  /**
   * Map database results to GradeHistoryEntry array
   *
   * Used for historical grade tracking in report cards.
   *
   * @param results - Array of database rows with score data
   * @returns Array of GradeHistoryEntry sorted by date
   */
  mapToGradeHistory(
    results: Array<{
      report_card_month: string;
      overall_score: string;
      percentile_rank: string;
      size_bucket: string;
    }>
  ): GradeHistoryEntry[] {
    // First, sort and map basic fields
    const sortedResults = results
      .map((r) => {
        const score = parseFloat(r.overall_score || '0');
        const grade = getLetterGrade(score);
        return {
          month: r.report_card_month,
          monthLabel: formatMonthLabel(r.report_card_month),
          score,
          grade,
          percentileRank: parseFloat(r.percentile_rank || '0'),
          sizeBucket: (r.size_bucket as SizeBucket) || 'medium',
        };
      })
      .sort((a, b) => a.month.localeCompare(b.month));

    // Then, calculate scoreChange and gradeChange based on previous entries
    return sortedResults.map((entry, index) => {
      if (index === 0) {
        return {
          ...entry,
          scoreChange: null,
          gradeChange: null,
        };
      }

      const prevEntry = sortedResults[index - 1];
      // prevEntry is guaranteed to exist when index > 0, but TypeScript needs the check
      if (!prevEntry) {
        return {
          ...entry,
          scoreChange: null,
          gradeChange: null,
        };
      }

      const scoreChange = entry.score - prevEntry.score;
      const gradeComparison = compareGrades(entry.grade, prevEntry.grade);
      const gradeChange: 'up' | 'down' | 'same' =
        gradeComparison > 0 ? 'up' : gradeComparison < 0 ? 'down' : 'same';

      return {
        ...entry,
        scoreChange,
        gradeChange,
      };
    });
  }

  /**
   * Map database results to MonthlyScore array
   *
   * Used for trend visualization and annual reviews.
   *
   * @param results - Array of database rows with score data
   * @returns Array of MonthlyScore sorted by date
   */
  mapToMonthlyScores(
    results: Array<{
      report_card_month: string;
      overall_score: string;
      percentile_rank: string;
    }>
  ): MonthlyScore[] {
    return results
      .map((r) => {
        const score = parseFloat(r.overall_score || '0');
        return {
          month: r.report_card_month,
          monthLabel: formatMonthLabel(r.report_card_month),
          score,
          grade: getLetterGrade(score),
          percentileRank: parseFloat(r.percentile_rank || '0'),
        };
      })
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  /**
   * Compare two report cards by grade
   *
   * Useful for sorting report cards by performance.
   *
   * @param a - First report card
   * @param b - Second report card
   * @returns Positive if a > b, negative if a < b, 0 if equal
   */
  compareByGrade(a: ReportCard, b: ReportCard): number {
    const gradeA = getLetterGrade(a.overall_score);
    const gradeB = getLetterGrade(b.overall_score);
    return compareGrades(gradeA, gradeB);
  }
}

/** Singleton instance */
export const resultMapper = new ResultMapper();
