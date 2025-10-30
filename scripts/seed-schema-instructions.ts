/**
 * Seed Schema Instructions
 * Adds initial global query rules for the ih schema
 */

import { db } from '@/lib/db';
import { explorerSchemaInstructions } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

const INITIAL_INSTRUCTIONS = [
  {
    title: 'Drug and Medication Filtering',
    category: 'filtering',
    instruction: 'When filtering by drug or medication names, always use the procedure_code column. Do NOT use medication_name or drug_name columns.',
    priority: 1,
    example_query: 'Show me all patients on Drug X',
    example_sql: 'SELECT * FROM ih.procedures WHERE procedure_code = \'DRUG_CODE\'',
  },
  {
    title: 'Revenue Queries',
    category: 'filtering',
    instruction: 'For revenue queries, filter by measure=\'revenue\' and use frequency=\'Monthly\' for monthly data, frequency=\'Quarterly\' for quarterly data.',
    priority: 1,
    example_query: 'What is my revenue for January 2024?',
    example_sql: 'SELECT SUM(value) FROM ih.agg_app_measures WHERE measure=\'revenue\' AND frequency=\'Monthly\' AND date_index >= \'2024-01-01\'',
  },
  {
    title: 'Patient Count Queries',
    category: 'aggregation',
    instruction: 'When counting patients, always use DISTINCT patient_uid to avoid duplicate counts. Never count rows directly.',
    priority: 1,
    example_query: 'How many patients do we have?',
    example_sql: 'SELECT COUNT(DISTINCT patient_uid) FROM ih.attribute_patients',
  },
  {
    title: 'Date Range Filtering',
    category: 'filtering',
    instruction: 'Use date_index column for date range filtering in aggregate tables. Format dates as YYYY-MM-DD.',
    priority: 2,
    example_query: 'Show me data from last month',
    example_sql: 'SELECT * FROM ih.agg_app_measures WHERE date_index >= \'2024-01-01\' AND date_index < \'2024-02-01\'',
  },
  {
    title: 'Practice Filtering Context',
    category: 'business_rule',
    instruction: 'All queries will automatically have practice_uid filtering applied for security. Do NOT manually add practice_uid filters.',
    priority: 2,
  },
  {
    title: 'Provider Metrics',
    category: 'aggregation',
    instruction: 'For provider-specific metrics, use provider_uid to group/filter. Provider names are in the provider_name column.',
    priority: 2,
    example_query: 'Which providers have the highest patient volume?',
    example_sql: 'SELECT provider_name, COUNT(DISTINCT patient_uid) FROM ih.agg_app_measures WHERE measure=\'visits\' GROUP BY provider_uid, provider_name ORDER BY count DESC',
  },
  {
    title: 'Time Period Grouping',
    category: 'aggregation',
    instruction: 'When grouping by month, use DATE_TRUNC(\'month\', date_index). For quarters, use DATE_TRUNC(\'quarter\', date_index).',
    priority: 3,
    example_query: 'Show me monthly trends',
    example_sql: 'SELECT DATE_TRUNC(\'month\', date_index) as month, SUM(value) FROM ih.agg_app_measures GROUP BY month ORDER BY month',
  },
];

async function seedInstructions() {
  console.log('🌱 Seeding schema instructions...\n');

  try {
    let created = 0;
    let skipped = 0;

    for (const inst of INITIAL_INSTRUCTIONS) {
      // Check if instruction already exists
      const [existing] = await db
        .select()
        .from(explorerSchemaInstructions)
        .where(
          and(
            eq(explorerSchemaInstructions.schema_name, 'ih'),
            eq(explorerSchemaInstructions.title, inst.title)
          )
        )
        .limit(1);

      if (existing) {
        console.log(`  ⏭️  ${inst.title} - Already exists`);
        skipped++;
        continue;
      }

      await db.insert(explorerSchemaInstructions).values({
        schema_name: 'ih',
        ...inst,
      });

      console.log(`  ✅ ${inst.title}`);
      created++;
    }

    console.log(`\n✅ Schema instructions seeded`);
    console.log(`   Created: ${created}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total: ${INITIAL_INSTRUCTIONS.length}\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seedInstructions();

