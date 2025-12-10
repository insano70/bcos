/**
 * Report Card Generator Service
 *
 * Generates weighted scores, percentile rankings, and insights
 * for practice report cards.
 * 
 * Stores monthly snapshots identified by report_card_month.
 * Supports historical generation for backfilling past months.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { report_card_statistics, report_card_results } from '@/lib/db/schema';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import { InsufficientDataError } from '@/lib/errors/report-card-errors';
import type { SizeBucket } from '@/lib/constants/report-card';
import { getReportCardMonthString, getHistoricalMonths } from '@/lib/utils/format-value';
import { getPracticeOrganizationMappings } from '@/lib/utils/organization-mapping';
import type { MeasureScore, MeasureConfig, GenerationResult } from '@/lib/types/report-card';
import type { GenerationOptions, MeasureScoringResult, PreloadedData } from './types';

// Extracted modules
import { scoreCalculator } from './scoring';
import { dataPreloader } from './data';
import { getActiveMeasures } from './measures';

/**
 * Report Card Generator Service
 *
 * Generates comprehensive report cards with weighted scores and insights.
 * Does not require RBAC context as it's designed for CLI/cron use.
 * Supports historical generation for backfilling past months.
 */
export class ReportCardGeneratorService {
  /**
   * Generate report cards for all practices or a specific practice
   * 
   * OPTIMIZED: Uses bulk data loading to minimize database queries.
   * Previous: ~25 queries per practice (N+1 pattern)
   * Current: ~10 bulk queries total + 1 bulk upsert per month
   * 
   * @param options.historical - If true, generates for all historical months
   * @param options.historicalMonths - Number of months to generate (default 24)
   * @param options.targetMonth - Specific month to generate (e.g., "2024-01-01")
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

      // Determine which months to generate
      let monthsToGenerate: string[];
      
      if (options.historical) {
        const numMonths = options.historicalMonths || 24;
        monthsToGenerate = getHistoricalMonths(numMonths);
        log.info('Historical generation mode', {
          operation: 'generate_report_cards',
          monthsToGenerate: monthsToGenerate.length,
          firstMonth: monthsToGenerate[monthsToGenerate.length - 1],
          lastMonth: monthsToGenerate[0],
          component: 'report-card',
        });
      } else if (options.targetMonth) {
        monthsToGenerate = [options.targetMonth];
      } else {
        monthsToGenerate = [getReportCardMonthString()];
      }

      log.info('Starting optimized report card generation', {
        operation: 'generate_report_cards',
        practiceCount: practices.length,
        monthCount: monthsToGenerate.length,
        practiceUid: options.practiceUid || 'all',
        force: options.force,
        historical: options.historical || false,
        component: 'report-card',
      });

      // Get active measures configuration (1 query)
      const measures = await getActiveMeasures();

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

      // BULK PRELOAD: Size buckets for all practices (1 query)
      const sizeBuckets = await dataPreloader.preloadSizeBuckets(practices);
      
      // BULK PRELOAD: Organization mappings (shared utility, 1 query)
      const organizationMap = await getPracticeOrganizationMappings(practices);

      log.info('Preloaded base data', {
        operation: 'generate_report_cards',
        sizeBucketsLoaded: sizeBuckets.size,
        organizationsLoaded: organizationMap.size,
        component: 'report-card',
      });

      // Process each month
      for (const targetMonth of monthsToGenerate) {
        const monthStartTime = Date.now();
        
        // BULK PRELOAD: Month statistics for all practices (1 query per month)
        const monthStats = await dataPreloader.preloadMonthStatistics(practices, measures, targetMonth);

        // BULK PRELOAD: Peer statistics by bucket (1 query per month)
        const peerStats = await dataPreloader.preloadPeerStatistics(measures, targetMonth);

        // BULK PRELOAD: Trend data for all practices (1 query per month)
        const trendData = await dataPreloader.preloadTrendData(practices, measures, targetMonth);

        // Bundle preloaded data
        const preloadedData: PreloadedData = {
          sizeBuckets,
          organizations: organizationMap,
          monthStatistics: monthStats,
          peerStatistics: peerStats,
          trendData,
          measures,
        };

        // Generate report cards for all practices using preloaded data
        const monthResults = await this.generateForMonthBulk(
          practices,
          targetMonth,
          preloadedData,
          errors
        );

        cardsGenerated += monthResults.generated;
        for (const uid of monthResults.processedPractices) {
          practiceSet.add(uid);
        }

        const monthDuration = Date.now() - monthStartTime;
        log.debug('Completed month generation', {
          operation: 'generate_report_cards',
          month: targetMonth,
          generated: monthResults.generated,
          duration: monthDuration,
          component: 'report-card',
        });
      }

      const duration = Date.now() - startTime;

      log.info('Report card generation completed', {
        operation: 'generate_report_cards',
        practicesProcessed: practiceSet.size,
        cardsGenerated,
        monthsProcessed: monthsToGenerate.length,
        errorCount: errors.length,
        duration,
        slow: duration > SLOW_THRESHOLDS.API_OPERATION,
        component: 'report-card',
      });

      return {
        success: cardsGenerated > 0,
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

  // ============================================================================
  // BULK GENERATION METHODS
  // ============================================================================

  /**
   * Generate report cards for all practices in a month using preloaded data
   * Uses bulk upsert for saving (always updates existing records)
   */
  private async generateForMonthBulk(
    practices: number[],
    targetMonth: string,
    preloadedData: PreloadedData,
    errors: GenerationResult['errors']
  ): Promise<{ generated: number; processedPractices: number[] }> {
    const reportCards: Array<{
      practice_uid: number;
      organization_id: string | null;
      report_card_month: string;
      overall_score: string;
      size_bucket: string;
      percentile_rank: string;
      insights: string[];
      measure_scores: Record<string, MeasureScore>;
    }> = [];
    const processedPractices: number[] = [];

    for (const practiceUid of practices) {
      try {
        const card = this.generateForPracticeWithPreloadedData(
          practiceUid,
          targetMonth,
          preloadedData
        );

        if (card) {
          reportCards.push(card);
          processedPractices.push(practiceUid);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorCode = error instanceof InsufficientDataError ? 'INSUFFICIENT_DATA' : 'GENERATION_FAILED';

        // Only log first few errors per practice to avoid spam
        const practiceErrors = errors.filter(e => e.practiceUid === practiceUid);
        if (practiceErrors.length < 3) {
          errors.push({
            practiceUid,
            error: `[${targetMonth}] ${errorMessage}`,
            code: errorCode,
          });
        }
      }
    }

    // Bulk upsert all report cards for this month
    if (reportCards.length > 0) {
      await db
        .insert(report_card_results)
        .values(reportCards)
        .onConflictDoUpdate({
          target: [report_card_results.practice_uid, report_card_results.report_card_month],
          set: {
            overall_score: sql`EXCLUDED.overall_score`,
            size_bucket: sql`EXCLUDED.size_bucket`,
            percentile_rank: sql`EXCLUDED.percentile_rank`,
            insights: sql`EXCLUDED.insights`,
            measure_scores: sql`EXCLUDED.measure_scores`,
            organization_id: sql`EXCLUDED.organization_id`,
            generated_at: new Date(),
          },
        });
    }

    return { generated: reportCards.length, processedPractices };
  }

  /**
   * Generate report card for a single practice using preloaded data
   * No database queries - all data comes from preloaded maps
   */
  private generateForPracticeWithPreloadedData(
    practiceUid: number,
    targetMonth: string,
    preloadedData: PreloadedData
  ): {
    practice_uid: number;
    organization_id: string | null;
    report_card_month: string;
    overall_score: string;
    size_bucket: string;
    percentile_rank: string;
    insights: string[];
    measure_scores: Record<string, MeasureScore>;
  } | null {
    const { sizeBuckets, organizations, monthStatistics, peerStatistics, trendData, measures } = preloadedData;

    // Get practice size bucket
    const sizeBucketData = sizeBuckets.get(practiceUid);
    if (!sizeBucketData) {
      throw new InsufficientDataError(practiceUid, 'Practice size bucket not assigned');
    }

    const sizeBucket = sizeBucketData.size_bucket as SizeBucket;
    const percentileRank = sizeBucketData.percentile;
    const organizationId = organizations.get(practiceUid) ?? null;

    // Calculate scores for each measure
    const measureScores: Record<string, MeasureScore> = {};
    const scoringResults: MeasureScoringResult[] = [];

    for (const measure of measures) {
      const scoring = scoreCalculator.scoreMeasure(
        practiceUid,
        measure,
        sizeBucket,
        targetMonth,
        monthStatistics,
        peerStatistics,
        trendData
      );

      if (scoring) {
        scoringResults.push(scoring);
        measureScores[measure.measure_name] = {
          score: scoring.normalizedScore,
          value: scoring.rawValue,
          trend: scoring.trend,
          trend_percentage: scoring.trendPercentage,
          percentile: scoring.percentileRank,
          peer_average: scoring.peerAverage,
          peer_count: scoring.peerCount,
        };
      }
    }

    if (scoringResults.length === 0) {
      throw new InsufficientDataError(practiceUid, `No measure scores for ${targetMonth}`);
    }

    // Calculate overall weighted score
    const overallScore = scoreCalculator.calculateOverallScore(scoringResults, measures);

    // Generate insights
    const insights = scoreCalculator.generateInsights(scoringResults, measures);

    return {
      practice_uid: practiceUid,
      organization_id: organizationId,
      report_card_month: targetMonth,
      overall_score: String(overallScore),
      size_bucket: sizeBucket,
      percentile_rank: String(percentileRank),
      insights,
      measure_scores: measureScores,
    };
  }

  /**
   * Get active measures configuration
   * @deprecated Use getActiveMeasures() from './measures' instead
   */
  async getActiveMeasures(): Promise<MeasureConfig[]> {
    return getActiveMeasures();
  }
}

// Export singleton instance for CLI and cron use
export const reportCardGenerator = new ReportCardGeneratorService();

