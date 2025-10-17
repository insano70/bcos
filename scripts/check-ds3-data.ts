#!/usr/bin/env tsx

/**
 * Check what measures/frequencies exist in DS #3
 */

import path from 'node:path';
// Load environment variables from .env.local
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { executeAnalyticsQuery } from '@/lib/services/analytics-db';

async function checkDS3Data() {
  console.log('🔍 Checking DS #3 actual data in database...\n');

  try {
    // Check unique measure + frequency combinations for practice 114
    const query = `
      SELECT 
        measure,
        time_period AS frequency,
        COUNT(*) as row_count,
        MIN(date_value::text) as earliest_date,
        MAX(date_value::text) as latest_date
      FROM ih.agg_chart_data
      WHERE practice_uid = 114
      GROUP BY measure, time_period
      ORDER BY measure, time_period
    `;

    const results = await executeAnalyticsQuery(query, []);

    console.log('📊 Measure + Frequency combinations for practice 114:\n');

    for (const row of results) {
      console.log(`   ${row.measure} (${row.frequency}): ${row.row_count} rows`);
      console.log(`      Date range: ${row.earliest_date} to ${row.latest_date}\n`);
    }

    // Check if Cancellations + Weekly exists
    const cancellationsWeekly = results.find(
      (r) => r.measure === 'Cancellations' && r.frequency === 'Weekly'
    );

    console.log('\n🔍 Specific checks:');
    console.log(`   Cancellations + Weekly: ${cancellationsWeekly ? '✅ EXISTS' : '❌ MISSING'}`);

    const cashTransferMonthly = results.find(
      (r) => r.measure === 'Cash Transfer' && r.frequency === 'Monthly'
    );
    console.log(`   Cash Transfer + Monthly: ${cashTransferMonthly ? '✅ EXISTS' : '❌ MISSING'}`);
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkDS3Data()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
