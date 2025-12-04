#!/usr/bin/env tsx
/**
 * Report Card Statistics Generator
 *
 * Collects practice metrics from analytics DB and generates report cards.
 * Designed to be run from CLI or triggered by cron/EventBridge.
 *
 * Usage:
 *   pnpm tsx --env-file=.env.local scripts/generate-report-card-stats.ts --all
 *   pnpm tsx --env-file=.env.local scripts/generate-report-card-stats.ts --practice 114
 *   pnpm tsx --env-file=.env.local scripts/generate-report-card-stats.ts --all --force
 *   pnpm tsx --env-file=.env.local scripts/generate-report-card-stats.ts --all --dry-run
 */

import { parseArgs } from 'node:util';

// Simple console logger for script execution
const logger = {
  info: (msg: string, data?: unknown) =>
    console.log(`ℹ️  ${msg}`, data ? JSON.stringify(data) : ''),
  success: (msg: string, data?: unknown) =>
    console.log(`✅ ${msg}`, data ? JSON.stringify(data) : ''),
  error: (msg: string, data?: unknown) =>
    console.error(`❌ ${msg}`, data ? JSON.stringify(data) : ''),
  warn: (msg: string, data?: unknown) =>
    console.warn(`⚠️  ${msg}`, data ? JSON.stringify(data) : ''),
};

// Parse command line arguments
const { values } = parseArgs({
  options: {
    all: { type: 'boolean', default: false },
    practice: { type: 'string' },
    force: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    'skip-collect': { type: 'boolean', default: false },
    'skip-trends': { type: 'boolean', default: false },
    'skip-sizing': { type: 'boolean', default: false },
    'skip-generate': { type: 'boolean', default: false },
    reset: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

function printUsage(): void {
  console.log(`
Report Card Statistics Generator

Usage:
  pnpm report-card:generate [options]

Options:
  --all              Generate stats for all practices
  --practice <uid>   Generate stats for specific practice UID
  --force            Regenerate even if recent stats exist
  --dry-run          Preview without saving to database
  --reset            Clear all report card data before generating
  --skip-collect     Skip statistics collection step
  --skip-trends      Skip trend analysis step
  --skip-sizing      Skip practice sizing step
  --skip-generate    Skip report card generation step
  -h, --help         Show this help message

Examples:
  # Generate stats for all practices
  pnpm report-card:generate --all

  # Generate stats for practice 114 only
  pnpm report-card:generate --practice 114

  # Force regeneration for all practices
  pnpm report-card:generate --all --force

  # Clear all data and regenerate
  pnpm report-card:generate --reset --all

  # Preview what would be generated
  pnpm report-card:generate --all --dry-run

  # Only run trend analysis (skip other steps)
  pnpm report-card:generate --all --skip-collect --skip-sizing --skip-generate
`);
}

async function main(): Promise<void> {
  const startTime = Date.now();

  try {
    // Show help if requested
    if (values.help) {
      printUsage();
      process.exit(0);
    }

    // Validate arguments (reset can be run alone)
    if (!values.all && !values.practice && !values.reset) {
      logger.error('Either --all, --practice <uid>, or --reset is required');
      printUsage();
      process.exit(1);
    }

    // Dynamic import to ensure env vars are loaded first (via tsx --env-file)
    const {
      statisticsCollector,
      trendAnalyzer,
      practiceSizer,
      reportCardGenerator,
    } = await import('@/lib/services/report-card');

    const practiceUid = values.practice ? parseInt(values.practice, 10) : undefined;
    const isDryRun = values['dry-run'];

    if (isDryRun) {
      logger.warn('DRY RUN MODE - no changes will be saved');
    }

    // Handle reset flag - clear all report card data
    if (values.reset) {
      logger.warn('RESET MODE - clearing all report card data...');
      
      if (!isDryRun) {
        const { db } = await import('@/lib/db');
        const {
          report_card_statistics,
          report_card_trends,
          practice_size_buckets,
          report_card_results,
        } = await import('@/lib/db/schema');

        // Delete in order to respect foreign key constraints (if any)
        await db.delete(report_card_results);
        logger.info('  Deleted report_card_results');
        
        await db.delete(report_card_trends);
        logger.info('  Deleted report_card_trends');
        
        await db.delete(practice_size_buckets);
        logger.info('  Deleted practice_size_buckets');
        
        await db.delete(report_card_statistics);
        logger.info('  Deleted report_card_statistics');
        
        logger.success('All report card data cleared');
      } else {
        logger.info('  [DRY RUN] Would clear all report card tables');
      }

      // If only --reset was specified, exit here
      if (!values.all && !values.practice) {
        const totalDuration = Date.now() - startTime;
        logger.success(`Reset completed in ${totalDuration}ms`);
        process.exit(0);
      }
    }

    logger.info('Starting report card statistics generation', {
      practiceUid: practiceUid ?? 'all',
      force: values.force,
      dryRun: isDryRun,
    });

    // Step 1: Collect statistics from analytics DB
    // Uses report_card_measures table as source of truth for which measures to collect
    // Measures must be configured via admin UI before collection will include them
    if (!values['skip-collect']) {
      logger.info('Step 1/5: Collecting statistics from analytics DB...');

      if (!isDryRun) {
        // Show configured active measures
        const activeMeasures = await statisticsCollector.getActiveMeasuresWithFilters();
        if (activeMeasures.length === 0) {
          logger.warn('  No active measures configured! Configure measures via admin UI first.');
        } else {
          logger.info(`  Configured active measures: ${activeMeasures.map(m => m.measure_name).join(', ')}`);
        }

        const collectResult = await statisticsCollector.collect({
          practiceUid,
          force: values.force ?? false,
        });
        logger.success(`Collected stats for ${collectResult.practicesProcessed} practices`, {
          recordsInserted: collectResult.recordsInserted,
          recordsUpdated: collectResult.recordsUpdated,
          duration: `${collectResult.duration}ms`,
        });
      } else {
        logger.info('  [DRY RUN] Would collect statistics');
      }
    } else {
      logger.info('Step 1/5: Skipping statistics collection (--skip-collect)');
    }

    // Step 2: Calculate trends
    if (!values['skip-trends']) {
      logger.info('Step 2/5: Calculating trends...');

      if (!isDryRun) {
        const trendResult = await trendAnalyzer.analyzeAll({ practiceUid });
        logger.success(`Calculated trends for ${trendResult.practicesProcessed} practices`, {
          trendsCalculated: trendResult.trendsCalculated,
          duration: `${trendResult.duration}ms`,
        });
      } else {
        logger.info('  [DRY RUN] Would calculate trends');
      }
    } else {
      logger.info('Step 2/5: Skipping trend analysis (--skip-trends)');
    }

    // Step 3: Assign size buckets
    if (!values['skip-sizing']) {
      logger.info('Step 3/5: Assigning size buckets...');

      if (!isDryRun) {
        const sizingResult = await practiceSizer.assignBuckets();
        logger.success(`Assigned buckets for ${sizingResult.practicesProcessed} practices`, {
          bucketCounts: sizingResult.bucketCounts,
          duration: `${sizingResult.duration}ms`,
        });
      } else {
        logger.info('  [DRY RUN] Would assign size buckets');
      }
    } else {
      logger.info('Step 3/5: Skipping practice sizing (--skip-sizing)');
    }

    // Step 4: Generate report cards
    if (!values['skip-generate']) {
      logger.info('Step 4/5: Generating report cards...');

      if (!isDryRun) {
        const generateResult = await reportCardGenerator.generateAll({ practiceUid });
        logger.success(`Generated ${generateResult.cardsGenerated} report cards`, {
          practicesProcessed: generateResult.practicesProcessed,
          errors: generateResult.errors.length,
          duration: `${generateResult.duration}ms`,
        });

        // Log any errors
        if (generateResult.errors.length > 0) {
          logger.warn('Some report cards failed to generate:');
          for (const error of generateResult.errors) {
            logger.warn(`  Practice ${error.practiceUid}: ${error.error}`);
          }
        }
      } else {
        logger.info('  [DRY RUN] Would generate report cards');
      }
    } else {
      logger.info('Step 4/5: Skipping report card generation (--skip-generate)');
    }

    // Step 5: Invalidate Redis cache
    logger.info('Step 5/5: Invalidating report card cache...');
    if (!isDryRun) {
      const { reportCardCache } = await import('@/lib/cache/report-card-cache');
      await reportCardCache.invalidate('all');
      logger.success('Cache invalidated');
    } else {
      logger.info('  [DRY RUN] Would invalidate cache');
    }

    const totalDuration = Date.now() - startTime;
    logger.success(`Report card generation completed in ${totalDuration}ms`);

    process.exit(0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Report card generation failed', { error: errorMessage });

    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }

    process.exit(1);
  }
}

// Run the script
main();

