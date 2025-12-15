#!/usr/bin/env tsx

import * as dotenv from 'dotenv';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

/**
 * Analytics Data Generation Script
 * Generates realistic data for ih.agg_chart_data table for testing and development
 */

// Simple console logger for script execution
const logger = {
  info: (message: string, data?: unknown) => {
    console.log(`ℹ️  ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  error: (message: string, data?: unknown) => {
    console.error(`❌ ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
};

// Configuration constants
const PRACTICE_UID = 114;
const PRACTICE_NAME = 'Family Arthritis Center';
const PRACTICE_PRIMARY = 'Busch, Howard';

const PROVIDERS = [
  { uid: 69, name: 'Busch, Howard' },
  { uid: 420, name: 'Ray, Madina' },
  { uid: 145, name: 'Busch-Feuer, Rachael' },
  { uid: 306, name: 'Simakova, Ekaterina' },
  { uid: 211, name: 'Savage, Christine' },
  { uid: 190, name: 'Andrade, Roslyn' },
];

const MEASURES = {
  Cancellations: { type: 'count', min: 0, max: 15 },
  'Unbilled Encounters': { type: 'count', min: 0, max: 25 },
  Encounters: { type: 'count', min: 50, max: 300 },
  'New Patients': { type: 'count', min: 15, max: 30 },
  'Follow Up': { type: 'count', min: 60, max: 120 },
  Tasks: { type: 'count', min: 0, max: 5 },
  Denials: { type: 'count', min: 2, max: 14 },
  'Unbilled Claims': { type: 'count', min: 0, max: 6 },
  'Unsigned Encounters': { type: 'count', min: 2, max: 13 },
  'New Infusions': { type: 'count', min: 1, max: 11 },
  'Cash Transfer': { type: 'currency', min: 75000, max: 150000 },
  'CPO Invoices': { type: 'currency', min: 2000, max: 75000 },
};

/**
 * Generate random number within range
 */
function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate random decimal for currency values
 */
function randomCurrency(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

/**
 * Generate date ranges for 2025 year to date
 */
function generateDateRanges() {
  const ranges: Array<{
    period: string;
    endDate: Date;
    displayDate: string;
  }> = [];

  const currentDate = new Date();
  const currentYear = 2025;

  // Weekly periods (every Friday of the year up to current date)
  for (let week = 1; week <= 52; week++) {
    const weekEndDate = new Date(currentYear, 0, 1 + week * 7 - 1);
    // Adjust to Friday
    weekEndDate.setDate(weekEndDate.getDate() + (5 - weekEndDate.getDay()));

    if (weekEndDate <= currentDate) {
      ranges.push({
        period: 'Weekly',
        endDate: weekEndDate,
        displayDate: `Week ${week}, ${currentYear}`,
      });
    }
  }

  // Monthly periods (last day of each month)
  const months = [
    { name: 'January', days: 31 },
    { name: 'February', days: 28 }, // 2025 is not a leap year
    { name: 'March', days: 31 },
    { name: 'April', days: 30 },
    { name: 'May', days: 31 },
    { name: 'June', days: 30 },
    { name: 'July', days: 31 },
    { name: 'August', days: 31 },
    { name: 'September', days: 30 },
    { name: 'October', days: 31 },
    { name: 'November', days: 30 },
    { name: 'December', days: 31 },
  ];

  for (let month = 0; month < 12; month++) {
    const monthData = months[month];
    if (!monthData) continue;

    const monthEndDate = new Date(currentYear, month, monthData.days);
    if (monthEndDate <= currentDate) {
      ranges.push({
        period: 'Monthly',
        endDate: monthEndDate,
        displayDate: `${monthData.name} ${currentYear}`,
      });
    }
  }

  // Quarterly periods
  const quarters = [
    { name: 'Q1', endMonth: 2, endDay: 31 }, // March 31
    { name: 'Q2', endMonth: 5, endDay: 30 }, // June 30
    { name: 'Q3', endMonth: 8, endDay: 30 }, // September 30
    { name: 'Q4', endMonth: 11, endDay: 31 }, // December 31
  ];

  for (const quarter of quarters) {
    const quarterEndDate = new Date(currentYear, quarter.endMonth, quarter.endDay);
    if (quarterEndDate <= currentDate) {
      ranges.push({
        period: 'Quarterly',
        endDate: quarterEndDate,
        displayDate: `${quarter.name} ${currentYear}`,
      });
    }
  }

  // Daily periods (every day from Jan 1 to current date)
  const startDate = new Date(currentYear, 0, 1); // Jan 1, 2025
  const dayInMs = 24 * 60 * 60 * 1000;

  for (let d = new Date(startDate); d <= currentDate; d = new Date(d.getTime() + dayInMs)) {
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const month = monthNames[d.getMonth()];
    const day = d.getDate();

    ranges.push({
      period: 'Daily',
      endDate: new Date(d),
      displayDate: `${month} ${day}, ${currentYear}`,
    });
  }

  return ranges;
}

/**
 * Generate numeric value based on measure type and time period
 */
function generateNumericValue(measure: string, timePeriod: string): number {
  const measureConfig = MEASURES[measure as keyof typeof MEASURES];
  if (!measureConfig) {
    throw new Error(`Unknown measure: ${measure}`);
  }

  let baseMin = measureConfig.min;
  let baseMax = measureConfig.max;

  // Adjust ranges based on time period
  if (timePeriod === 'Daily') {
    baseMin = Math.floor(baseMin * 0.033); // Daily is ~1/30th of monthly
    baseMax = Math.floor(baseMax * 0.033);
  } else if (timePeriod === 'Weekly') {
    baseMin = Math.floor(baseMin * 0.2); // Weekly is ~20% of monthly
    baseMax = Math.floor(baseMax * 0.3);
  } else if (timePeriod === 'Quarterly') {
    baseMin = Math.floor(baseMin * 2.5); // Quarterly is ~3x monthly
    baseMax = Math.floor(baseMax * 3.5);
  }

  if (measureConfig.type === 'currency') {
    return randomCurrency(baseMin, baseMax);
  } else {
    return randomBetween(baseMin, baseMax);
  }
}

/**
 * Get analytics database connection
 */
function getAnalyticsConnection() {
  const analyticsUrl = process.env.ANALYTICS_DATABASE_URL;
  if (!analyticsUrl) {
    throw new Error('ANALYTICS_DATABASE_URL is not configured in .env.local');
  }

  const client = postgres(analyticsUrl, {
    ssl: 'require',
    max: 5,
  });

  return drizzle(client);
}

/**
 * Main data generation function
 */
async function generateAnalyticsData() {
  logger.info('Starting analytics data generation', {
    practiceUid: PRACTICE_UID,
    practiceName: PRACTICE_NAME,
    providerCount: PROVIDERS.length,
    measureCount: Object.keys(MEASURES).length,
  });

  try {
    const analyticsDb = getAnalyticsConnection();

    // Clear existing data for this practice (optional - remove if you want to keep existing data)
    logger.info('Clearing existing data for practice', { practiceUid: PRACTICE_UID });
    await analyticsDb.execute(sql`
      DELETE FROM ih.agg_chart_data 
      WHERE practice_uid = ${PRACTICE_UID}
    `);

    const dateRanges = generateDateRanges();
    const records: Array<{
      practice_uid: number;
      practice: string;
      practice_primary: string;
      provider_uid: number;
      provider_name: string;
      entity_type: string;
      entity_id: string;
      entity_name: string;
      measure: string;
      measure_type: string;
      time_period: string;
      date_value: string;
      display_date: string;
      numeric_value: number;
      text_value: string | null;
      metadata: null;
    }> = [];

    // Generate data for each provider, measure, and date range
    for (const provider of PROVIDERS) {
      for (const measureName of Object.keys(MEASURES)) {
        const measureConfig = MEASURES[measureName as keyof typeof MEASURES];

        for (const dateRange of dateRanges) {
          // Skip daily data for measures other than 'Cash Transfer'
          if (dateRange.period === 'Daily' && measureName !== 'Cash Transfer') {
            continue;
          }

          // Add some randomness - not every provider has data for every period/measure
          if (Math.random() < 0.85) {
            // 85% chance of having data
            records.push({
              practice_uid: PRACTICE_UID,
              practice: PRACTICE_NAME,
              practice_primary: PRACTICE_PRIMARY,
              provider_uid: provider.uid,
              provider_name: provider.name,
              entity_type: 'Provider',
              entity_id: provider.uid.toString(),
              entity_name: provider.name,
              measure: measureName,
              measure_type: measureConfig.type,
              time_period: dateRange.period,
              date_value: dateRange.endDate.toISOString().split('T')[0] || '', // YYYY-MM-DD format
              display_date: dateRange.displayDate,
              numeric_value: generateNumericValue(measureName, dateRange.period),
              text_value: null,
              metadata: null,
            });
          }
        }
      }
    }

    logger.info('Generated records for insertion', {
      recordCount: records.length,
      dateRangeCount: dateRanges.length,
    });

    // Insert data in batches to avoid memory issues
    const batchSize = 100;
    let insertedCount = 0;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      // Build the VALUES clause for batch insert
      const values = batch
        .map(
          (record) =>
            `(${record.practice_uid}, '${record.practice}', '${record.practice_primary}', ${record.provider_uid}, '${record.provider_name}', '${record.entity_type}', '${record.entity_id}', '${record.entity_name}', '${record.measure}', '${record.measure_type}', '${record.time_period}', '${record.date_value}', '${record.display_date}', ${record.numeric_value}, ${record.text_value}, ${record.metadata})`
        )
        .join(',');

      await analyticsDb.execute(
        sql.raw(`
        INSERT INTO ih.agg_chart_data 
        (practice_uid, practice, practice_primary, provider_uid, provider_name, entity_type, entity_id, entity_name, measure, measure_type, time_period, date_value, display_date, numeric_value, text_value, metadata)
        VALUES ${values}
      `)
      );

      insertedCount += batch.length;
      logger.info('Inserted batch', {
        batchNumber: Math.floor(i / batchSize) + 1,
        batchSize: batch.length,
        totalInserted: insertedCount,
        remaining: records.length - insertedCount,
      });
    }

    // Generate summary statistics
    const stats = await analyticsDb.execute(sql`
      SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT provider_uid) as unique_providers,
        COUNT(DISTINCT measure) as unique_measures,
        COUNT(DISTINCT time_period) as unique_periods,
        MIN(date_value) as earliest_date,
        MAX(date_value) as latest_date
      FROM ih.agg_chart_data 
      WHERE practice_uid = ${PRACTICE_UID}
    `);

    logger.info('Analytics data generation completed successfully', {
      practiceUid: PRACTICE_UID,
      totalRecords: insertedCount,
      statistics: stats[0],
    });

    console.log('\n🎉 Analytics Data Generation Complete!');
    console.log(`📊 Generated ${insertedCount} records for ${PRACTICE_NAME}`);
    console.log(`👥 ${PROVIDERS.length} providers across ${Object.keys(MEASURES).length} measures`);
    console.log(
      `📅 ${dateRanges.length} time periods (Daily for Cash Transfer, Weekly, Monthly, Quarterly for all)`
    );
    console.log(`📈 Statistics:`, stats[0]);
  } catch (error) {
    logger.error('Analytics data generation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      practiceUid: PRACTICE_UID,
    });

    console.error('\n❌ Data generation failed:', error);
    throw error;
  }
}

/**
 * Run the script
 */
if (require.main === module) {
  generateAnalyticsData()
    .then(() => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Script failed:', error);
      process.exit(1);
    });
}

export { generateAnalyticsData };
