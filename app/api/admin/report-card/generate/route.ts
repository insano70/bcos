import type { NextRequest } from 'next/server';
import { createErrorResponse, handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log } from '@/lib/logger';
import { db } from '@/lib/db';
import {
  report_card_results,
  report_card_trends,
  report_card_statistics,
  practice_size_buckets,
} from '@/lib/db/report-card-schema';
import {
  statisticsCollector,
  trendAnalyzer,
  practiceSizer,
  reportCardGenerator,
} from '@/lib/services/report-card';
import { reportCardCache } from '@/lib/cache/report-card-cache';
import type { UserContext } from '@/lib/types/rbac';
import { generateRequestSchema } from '@/lib/validations/report-card';

/**
 * Report Card API - Trigger report card generation
 *
 * This endpoint is for manual/admin-triggered generation.
 * Production generation should be handled by CLI/cron.
 */

const generateReportCardsHandler = async (
  request: NextRequest,
  userContext: UserContext
) => {
  const startTime = Date.now();

  try {
    // Parse and validate request body
    const requestBody = await request.json();
    const validationResult = generateRequestSchema.safeParse(requestBody);

    if (!validationResult.success) {
      const errorDetails = validationResult.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');

      return createErrorResponse(`Validation failed: ${errorDetails}`, 400, request);
    }

    const { practiceUid, force, reset, historical, historicalMonths } = validationResult.data;

    // If reset is true, default to historical generation for full data rebuild
    const useHistorical = historical || reset;
    const monthsToGenerate = historicalMonths;

    log.info('Starting report card generation', {
      operation: 'generate_report_cards',
      practiceUid: practiceUid ?? 'all',
      force,
      reset,
      historical: useHistorical,
      historicalMonths: useHistorical ? monthsToGenerate : undefined,
      userId: userContext.user_id,
      component: 'report-card',
    });

    // Step 0: Reset all data if requested
    if (reset) {
      log.info('Resetting all report card data', {
        operation: 'reset_report_card_data',
        userId: userContext.user_id,
        component: 'report-card',
      });

      // Clear all tables in the correct order (results first, then supporting tables)
      await db.delete(report_card_results);
      await db.delete(report_card_trends);
      await db.delete(practice_size_buckets);
      await db.delete(report_card_statistics);

      // Invalidate all caches
      await reportCardCache.invalidate('all');

      log.info('Report card data reset complete', {
        operation: 'reset_report_card_data',
        userId: userContext.user_id,
        component: 'report-card',
      });
    }

    // Step 1: Collect statistics
    // SECURITY: fromAdminApi validates this is from authorized admin endpoint
    const collectResult = await statisticsCollector.collect({
      practiceUid,
      force: force || reset, // Force collection if reset
      fromAdminApi: true,
    });

    // Step 2: Calculate trends
    const trendResult = await trendAnalyzer.analyzeAll({ practiceUid });

    // Step 3: Assign size buckets
    const sizingResult = await practiceSizer.assignBuckets();

    // Step 4: Generate report cards (historical if reset or explicitly requested)
    const generateResult = await reportCardGenerator.generateAll({ 
      practiceUid,
      force: force || reset,
      historical: useHistorical,
      historicalMonths: useHistorical ? monthsToGenerate : undefined,
    });

    // Always invalidate cache after generation to ensure fresh data is shown
    await reportCardCache.invalidate('all');

    const duration = Date.now() - startTime;

    log.info('Report card generation completed', {
      operation: 'generate_report_cards',
      practiceUid: practiceUid ?? 'all',
      collectResult: {
        practicesProcessed: collectResult.practicesProcessed,
        recordsInserted: collectResult.recordsInserted,
      },
      trendResult: {
        practicesProcessed: trendResult.practicesProcessed,
        trendsCalculated: trendResult.trendsCalculated,
      },
      sizingResult: {
        practicesProcessed: sizingResult.practicesProcessed,
        bucketCounts: sizingResult.bucketCounts,
      },
      generateResult: {
        cardsGenerated: generateResult.cardsGenerated,
        errors: generateResult.errors.length,
      },
      userId: userContext.user_id,
      duration,
      component: 'report-card',
    });

    // Success if at least some cards were generated
    const hasSuccess = generateResult.cardsGenerated > 0;
    
    return createSuccessResponse(
      {
        success: hasSuccess,
        summary: {
          statisticsCollected: collectResult.practicesProcessed,
          trendsCalculated: trendResult.trendsCalculated,
          sizingAssigned: sizingResult.practicesProcessed,
          cardsGenerated: generateResult.cardsGenerated,
          errors: generateResult.errors.length,
          duration,
        },
        errors: generateResult.errors,
      },
      hasSuccess
        ? `Generated ${generateResult.cardsGenerated} report cards${generateResult.errors.length > 0 ? ` (${generateResult.errors.length} practices skipped)` : ''}`
        : 'No report cards could be generated'
    );
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Report card generation failed', error as Error, {
      userId: userContext.user_id,
      duration,
      component: 'report-card',
    });

    return handleRouteError(error, 'Failed to generate report cards', request);
  }
};

// SECURITY: Admin-only with very restrictive rate limit (resource-intensive operation)
export const POST = rbacRoute(generateReportCardsHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'admin_cli',
});


