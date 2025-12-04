/**
 * Report Card Generator Service
 *
 * Generates weighted scores, percentile rankings, and insights
 * for practice report cards.
 */

import { eq, and, desc, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  report_card_statistics,
  report_card_trends,
  report_card_measures,
  report_card_results,
  practice_size_buckets,
} from '@/lib/db/schema';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import { InsufficientDataError } from '@/lib/errors/report-card-errors';
import { GRADE_THRESHOLDS, REPORT_CARD_LIMITS, type SizeBucket, type TrendDirection } from '@/lib/constants/report-card';
import type {
  ReportCard,
  MeasureScore,
  MeasureConfig,
  GenerationResult,
} from '@/lib/types/report-card';
import type {
  GenerationOptions,
  MeasureScoringResult,
} from './types';

/**
 * Report Card Generator Service
 *
 * Generates comprehensive report cards with weighted scores and insights.
 * Does not require RBAC context as it's designed for CLI/cron use.
 */
export class ReportCardGeneratorService {
  /**
   * Generate report cards for all practices or a specific practice
   */
  async generateAll(options: GenerationOptions = {}): Promise<GenerationResult> {
    const startTime = Date.now();
    let cardsGenerated = 0;
    const errors: GenerationResult['errors'] = [];
    const practiceSet = new Set<number>();

    try {
      // Get practices to process
      let practices: number[];

      if (options.practiceUid) {
        practices = [options.practiceUid];
      } else {
        const result = await db
          .selectDistinct({ practice_uid: report_card_statistics.practice_uid })
          .from(report_card_statistics);
        practices = result.map((r) => r.practice_uid);
      }

      log.info('Starting report card generation', {
        operation: 'generate_report_cards',
        practiceCount: practices.length,
        practiceUid: options.practiceUid || 'all',
        force: options.force,
        component: 'report-card',
      });

      // Get active measures configuration
      const measures = await this.getActiveMeasures();

      if (measures.length === 0) {
        log.warn('No active measures configured for report card generation', {
          operation: 'generate_report_cards',
          component: 'report-card',
        });

        return {
          success: true,
          practicesProcessed: 0,
          cardsGenerated: 0,
          errors: [],
          duration: Date.now() - startTime,
        };
      }

      // Generate report card for each practice
      for (const practiceUid of practices) {
        try {
          const card = await this.generateForPractice(practiceUid, measures, options.force);

          if (card) {
            cardsGenerated++;
            practiceSet.add(practiceUid);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const errorCode = error instanceof InsufficientDataError ? 'INSUFFICIENT_DATA' : 'GENERATION_FAILED';

          errors.push({
            practiceUid,
            error: errorMessage,
            code: errorCode,
          });
        }
      }

      const duration = Date.now() - startTime;

      log.info('Report card generation completed', {
        operation: 'generate_report_cards',
        practicesProcessed: practiceSet.size,
        cardsGenerated,
        errorCount: errors.length,
        duration,
        slow: duration > SLOW_THRESHOLDS.API_OPERATION,
        component: 'report-card',
      });

      return {
        success: errors.length === 0,
        practicesProcessed: practiceSet.size,
        cardsGenerated,
        errors,
        duration,
      };
    } catch (error) {
      log.error('Report card generation failed', error as Error, {
        operation: 'generate_report_cards',
        practiceUid: options.practiceUid,
        component: 'report-card',
      });
      throw error;
    }
  }

  /**
   * Generate report card for a single practice
   * @param practiceUid - Practice UID to generate report card for
   * @param measures - Optional measures config (will fetch if not provided)
   * @param force - Force regeneration even if recent report card exists
   */
  async generateForPractice(
    practiceUid: number,
    measures?: MeasureConfig[],
    force?: boolean
  ): Promise<ReportCard | null> {
    // Check if recent report card exists (skip if not forcing)
    if (!force) {
      const staleThreshold = new Date();
      staleThreshold.setHours(staleThreshold.getHours() - REPORT_CARD_LIMITS.STALE_THRESHOLD_HOURS);

      const [existing] = await db
        .select({
          result_id: report_card_results.result_id,
          generated_at: report_card_results.generated_at,
        })
        .from(report_card_results)
        .where(eq(report_card_results.practice_uid, practiceUid))
        .orderBy(desc(report_card_results.generated_at))
        .limit(1);

      if (existing?.generated_at && existing.generated_at > staleThreshold) {
        // Recent report card exists, skip regeneration
        log.info('Skipping report card generation - recent card exists', {
          operation: 'generate_report_card',
          practiceUid,
          existingCardId: existing.result_id,
          generatedAt: existing.generated_at.toISOString(),
          component: 'report-card',
        });
        return null;
      }
    }

    // Get measures if not provided
    const activeMeasures = measures || await this.getActiveMeasures();

    if (activeMeasures.length === 0) {
      throw new InsufficientDataError(practiceUid, 'No active measures configured');
    }

    // Get practice size bucket
    const [sizeResult] = await db
      .select()
      .from(practice_size_buckets)
      .where(eq(practice_size_buckets.practice_uid, practiceUid))
      .limit(1);

    if (!sizeResult) {
      throw new InsufficientDataError(practiceUid, 'Practice size bucket not assigned');
    }

    const sizeBucket = sizeResult.size_bucket as SizeBucket;
    const percentileRank = parseFloat(sizeResult.percentile || '0');

    // Calculate scores for each measure
    const measureScores: Record<string, MeasureScore> = {};
    const scoringResults: MeasureScoringResult[] = [];

    for (const measure of activeMeasures) {
      const scoring = await this.scoreMeasure(practiceUid, measure, sizeBucket);

      if (scoring) {
        scoringResults.push(scoring);
        measureScores[measure.measure_name] = {
          score: scoring.normalizedScore,
          value: scoring.rawValue,
          trend: scoring.trend,
          trend_percentage: scoring.trendPercentage,
          percentile: scoring.percentileRank,
          peer_average: scoring.peerAverage,
        };
      }
    }

    if (scoringResults.length === 0) {
      throw new InsufficientDataError(practiceUid, 'No measure scores could be calculated');
    }

    // Calculate overall weighted score
    const overallScore = this.calculateOverallScore(scoringResults, activeMeasures);

    // Generate insights
    const insights = this.generateInsights(scoringResults, activeMeasures);

    // Get organization ID
    const [orgResult] = await db
      .select({ organization_id: report_card_statistics.organization_id })
      .from(report_card_statistics)
      .where(eq(report_card_statistics.practice_uid, practiceUid))
      .limit(1);

    const organizationId = orgResult?.organization_id || null;

    // Save report card
    const reportCard = await this.saveReportCard({
      practiceUid,
      organizationId,
      overallScore,
      sizeBucket,
      percentileRank,
      insights,
      measureScores,
    });

    return reportCard;
  }

  /**
   * Score a single measure for a practice
   */
  private async scoreMeasure(
    practiceUid: number,
    measure: MeasureConfig,
    sizeBucket: SizeBucket
  ): Promise<MeasureScoringResult | null> {
    // Get latest statistics for this measure
    const [latestStat] = await db
      .select({ value: report_card_statistics.value })
      .from(report_card_statistics)
      .where(
        and(
          eq(report_card_statistics.practice_uid, practiceUid),
          eq(report_card_statistics.measure_name, measure.measure_name)
        )
      )
      .orderBy(desc(report_card_statistics.period_date))
      .limit(1);

    if (!latestStat) {
      return null;
    }

    const rawValue = parseFloat(latestStat.value);

    // Get peer statistics for percentile calculation
    const peerData = await this.getPeerStatistics(measure.measure_name, sizeBucket);

    // Calculate percentile rank
    const percentileRank = this.calculatePercentile(rawValue, peerData.values, measure.higher_is_better);

    // Get trend for this measure
    const [trendResult] = await db
      .select({
        trend_direction: report_card_trends.trend_direction,
        trend_percentage: report_card_trends.trend_percentage,
      })
      .from(report_card_trends)
      .where(
        and(
          eq(report_card_trends.practice_uid, practiceUid),
          eq(report_card_trends.measure_name, measure.measure_name),
          eq(report_card_trends.trend_period, '3_month')
        )
      )
      .limit(1);

    const trend = (trendResult?.trend_direction as TrendDirection) || 'stable';
    const trendPercentage = parseFloat(trendResult?.trend_percentage || '0');

    // Normalize score to 0-100 scale
    const normalizedScore = this.normalizeScore(percentileRank, trend, measure.higher_is_better);

    return {
      measureName: measure.measure_name,
      rawValue,
      normalizedScore,
      percentileRank,
      peerAverage: peerData.average,
      trend,
      trendPercentage,
    };
  }

  /**
   * Get peer statistics for a measure within a size bucket
   */
  private async getPeerStatistics(
    measureName: string,
    sizeBucket: SizeBucket
  ): Promise<{ values: number[]; average: number }> {
    // Get practices in the same size bucket
    const peerPractices = await db
      .select({ practice_uid: practice_size_buckets.practice_uid })
      .from(practice_size_buckets)
      .where(eq(practice_size_buckets.size_bucket, sizeBucket));

    if (peerPractices.length === 0) {
      return { values: [], average: 0 };
    }

    const practiceUids = peerPractices.map((p) => p.practice_uid);

    // Get latest value for each peer practice
    const peerStats = await db
      .selectDistinctOn([report_card_statistics.practice_uid], {
        value: report_card_statistics.value,
      })
      .from(report_card_statistics)
      .where(
        and(
          inArray(report_card_statistics.practice_uid, practiceUids),
          eq(report_card_statistics.measure_name, measureName)
        )
      )
      .orderBy(
        report_card_statistics.practice_uid,
        desc(report_card_statistics.period_date)
      );

    const values = peerStats.map((s) => parseFloat(s.value));
    const average = values.length > 0
      ? values.reduce((sum, v) => sum + v, 0) / values.length
      : 0;

    return { values, average };
  }

  /**
   * Calculate percentile rank
   */
  private calculatePercentile(
    value: number,
    allValues: number[],
    higherIsBetter: boolean
  ): number {
    if (allValues.length === 0) return 50;

    const countBelow = allValues.filter((v) =>
      higherIsBetter ? v < value : v > value
    ).length;

    return (countBelow / allValues.length) * 100;
  }

  /**
   * Normalize score to a grade-friendly 70-100 scale
   * 
   * TRANSFORMATION LOGIC:
   * Raw percentile (0-100) is transformed to fit within 70-100 range:
   * - 0th percentile → 70 (C-, the floor)
   * - 50th percentile → 85 (B-)
   * - 100th percentile → 100 (A+)
   * 
   * This ensures:
   * - No practice gets below C- (70)
   * - Average performers (50th percentile) get B- (85)
   * - Top performers get A range scores
   * - There's still meaningful differentiation
   */
  private normalizeScore(
    percentileRank: number,
    trend: TrendDirection,
    _higherIsBetter: boolean
  ): number {
    // Transform percentile (0-100) to grading scale (70-100)
    // Formula: 70 + (percentile / 100) * 30
    let score = 70 + (percentileRank / 100) * 30;

    // Adjust for trend (±3 points instead of ±5 to not exceed 100)
    if (trend === 'improving') {
      score = Math.min(100, score + 3);
    } else if (trend === 'declining') {
      score = Math.max(70, score - 3);
    }

    return Math.round(score * 10) / 10;
  }

  /**
   * Calculate overall weighted score
   */
  private calculateOverallScore(
    results: MeasureScoringResult[],
    measures: MeasureConfig[]
  ): number {
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
   * Generate human-readable insights
   */
  private generateInsights(
    results: MeasureScoringResult[],
    measures: MeasureConfig[]
  ): string[] {
    const insights: string[] = [];

    // Find top and bottom performers
    const sorted = [...results].sort((a, b) => b.normalizedScore - a.normalizedScore);

    const top = sorted[0];
    if (top) {
      const topMeasure = measures.find((m) => m.measure_name === top.measureName);
      insights.push(
        `Strongest performance in ${topMeasure?.display_name ?? top.measureName} (${Math.round(top.percentileRank)}th percentile)`
      );
    }

    if (sorted.length > 1) {
      const bottom = sorted[sorted.length - 1];
      if (bottom && bottom.normalizedScore < 50) {
        const bottomMeasure = measures.find((m) => m.measure_name === bottom.measureName);
        insights.push(
          `Opportunity for improvement in ${bottomMeasure?.display_name ?? bottom.measureName} (${Math.round(bottom.percentileRank)}th percentile)`
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

  /**
   * Save report card to database
   */
  private async saveReportCard(data: {
    practiceUid: number;
    organizationId: string | null;
    overallScore: number;
    sizeBucket: SizeBucket;
    percentileRank: number;
    insights: string[];
    measureScores: Record<string, MeasureScore>;
  }): Promise<ReportCard> {
    // Check for existing report card
    const [existing] = await db
      .select({ result_id: report_card_results.result_id })
      .from(report_card_results)
      .where(eq(report_card_results.practice_uid, data.practiceUid))
      .orderBy(desc(report_card_results.generated_at))
      .limit(1);

    let resultId: string;

    if (existing) {
      // Update existing report card
      await db
        .update(report_card_results)
        .set({
          overall_score: String(data.overallScore),
          size_bucket: data.sizeBucket,
          percentile_rank: String(data.percentileRank),
          insights: data.insights,
          measure_scores: data.measureScores,
          organization_id: data.organizationId,
          generated_at: new Date(),
        })
        .where(eq(report_card_results.result_id, existing.result_id));

      resultId = existing.result_id;
    } else {
      // Insert new report card
      const [inserted] = await db
        .insert(report_card_results)
        .values({
          practice_uid: data.practiceUid,
          organization_id: data.organizationId,
          overall_score: String(data.overallScore),
          size_bucket: data.sizeBucket,
          percentile_rank: String(data.percentileRank),
          insights: data.insights,
          measure_scores: data.measureScores,
        })
        .returning({ result_id: report_card_results.result_id });

      if (!inserted) {
        throw new Error('Failed to create report card - no result returned');
      }

      resultId = inserted.result_id;
    }

    return {
      result_id: resultId,
      practice_uid: data.practiceUid,
      organization_id: data.organizationId,
      generated_at: new Date().toISOString(),
      overall_score: data.overallScore,
      size_bucket: data.sizeBucket,
      percentile_rank: data.percentileRank,
      insights: data.insights,
      measure_scores: data.measureScores,
    };
  }

  /**
   * Get active measures configuration
   */
  async getActiveMeasures(): Promise<MeasureConfig[]> {
    const measures = await db
      .select()
      .from(report_card_measures)
      .where(eq(report_card_measures.is_active, true))
      .orderBy(desc(report_card_measures.weight));

    return measures.map((m) => ({
      measure_id: m.measure_id,
      measure_name: m.measure_name,
      display_name: m.display_name,
      weight: parseFloat(m.weight || '5'),
      is_active: m.is_active ?? true,
      higher_is_better: m.higher_is_better ?? true,
      format_type: (m.format_type as 'number' | 'currency' | 'percentage') || 'number',
      data_source_id: m.data_source_id,
      value_column: m.value_column ?? 'numeric_value',
      filter_criteria: (m.filter_criteria as Record<string, string>) || {},
      created_at: m.created_at?.toISOString() || new Date().toISOString(),
      updated_at: m.updated_at?.toISOString() || new Date().toISOString(),
    }));
  }

  /**
   * Get letter grade for a score
   */
  /**
   * Get letter grade from score
   * Floored at C - no D's or F's are assigned
   */
  getLetterGrade(score: number): string {
    if (score >= GRADE_THRESHOLDS.A) return 'A';
    if (score >= GRADE_THRESHOLDS.B) return 'B';
    // Floor at C - lowest grade is C
    return 'C';
  }
}

// Export singleton instance for CLI and cron use
export const reportCardGenerator = new ReportCardGeneratorService();

