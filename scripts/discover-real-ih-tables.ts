/**
 * Discover Real Tables in ih Schema
 * 
 * Queries the analytics database to find actual tables in the ih schema
 * and generates metadata entries for them.
 */

import { executeAnalyticsQuery } from '@/lib/services/analytics-db';
import { db } from '@/lib/db';
import { explorerTableMetadata } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { log } from '@/lib/logger';

interface TableInfo {
  table_name: string;
  row_estimate: number;
}

interface ColumnInfo {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
}

async function discoverRealTables() {
  console.log('🔍 Discovering real tables in ih schema...\n');

  try {
    // Query information_schema to find all tables in ih schema
    const tables = await executeAnalyticsQuery<TableInfo>(`
      SELECT 
        table_name,
        0 as row_estimate
      FROM information_schema.tables
      WHERE table_schema = 'ih'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    console.log(`✅ Found ${tables.length} tables in ih schema\n`);

    if (tables.length === 0) {
      console.log('⚠️  No tables found in ih schema. Check ANALYTICS_DATABASE_URL configuration.');
      process.exit(1);
    }

    // Display first 20 tables
    console.log('First 20 tables:');
    tables.slice(0, 20).forEach((t, idx) => {
      console.log(`  ${idx + 1}. ${t.table_name}`);
    });
    
    if (tables.length > 20) {
      console.log(`  ... and ${tables.length - 20} more\n`);
    }

    // For each table, get column information
    console.log('\n📊 Getting column details for tables...\n');
    
    const tableDetails: Array<{
      table_name: string;
      columns: ColumnInfo[];
      row_estimate: number;
    }> = [];

    // Get details for first 10 tables (to avoid overwhelming output)
    for (const table of tables.slice(0, 10)) {
      const columns = await executeAnalyticsQuery<ColumnInfo>(`
        SELECT 
          column_name,
          data_type,
          is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'ih'
          AND table_name = '${table.table_name}'
        ORDER BY ordinal_position
      `);

      tableDetails.push({
        table_name: table.table_name,
        columns,
        row_estimate: table.row_estimate,
      });

      console.log(`Table: ${table.table_name}`);
      console.log(`  Columns: ${columns.length}`);
      console.log(`  Sample columns: ${columns.slice(0, 5).map(c => c.column_name).join(', ')}${columns.length > 5 ? ', ...' : ''}`);
      console.log('');
    }

    // Now seed metadata for real tables
    console.log('\n💾 Seeding metadata for discovered tables...\n');

    let seededCount = 0;
    let skippedCount = 0;

    for (const detail of tableDetails) {
      // Check if already exists
      const [existing] = await db
        .select()
        .from(explorerTableMetadata)
        .where(
          and(
            eq(explorerTableMetadata.schema_name, 'ih'),
            eq(explorerTableMetadata.table_name, detail.table_name)
          )
        )
        .limit(1);

      if (existing) {
        console.log(`  ⏭️  ${detail.table_name} - Already exists, skipping`);
        skippedCount++;
        continue;
      }

      // Determine tier based on table name patterns (heuristic)
      let tier = 3; // Default to Tier 3
      const lowerName = detail.table_name.toLowerCase();
      
      // Tier 1: Core aggregated measures and key entities
      if (lowerName.includes('agg_') || lowerName.includes('_measures') || 
          lowerName.includes('patient') || lowerName.includes('encounter') ||
          lowerName.includes('claim') || lowerName.includes('payment')) {
        tier = 1;
      }
      // Tier 2: Secondary tables
      else if (lowerName.includes('provider') || lowerName.includes('practice') ||
               lowerName.includes('diagnosis') || lowerName.includes('procedure')) {
        tier = 2;
      }

      // Detect common filter columns
      const commonFilters: string[] = [];
      const columnNames = detail.columns.map(c => c.column_name.toLowerCase());
      
      if (columnNames.includes('practice_uid')) commonFilters.push('practice_uid');
      if (columnNames.includes('provider_uid')) commonFilters.push('provider_uid');
      if (columnNames.includes('date_index')) commonFilters.push('date_index');
      if (columnNames.includes('created_at')) commonFilters.push('created_at');
      if (columnNames.includes('measure')) commonFilters.push('measure');
      if (columnNames.includes('frequency') || columnNames.includes('time_period')) {
        commonFilters.push(columnNames.includes('frequency') ? 'frequency' : 'time_period');
      }

      // Generate basic description
      const description = `Table: ${detail.table_name} (${detail.columns.length} columns, auto-discovered from ih schema)`;

      await db.insert(explorerTableMetadata).values({
        schema_name: 'ih',
        table_name: detail.table_name,
        display_name: detail.table_name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        description: description,
        tier: tier,
        common_filters: commonFilters.length > 0 ? commonFilters : null,
        is_active: true,
        is_auto_discovered: true,
        confidence_score: '0.60', // Medium confidence for auto-discovered
      });

      console.log(`  ✅ ${detail.table_name} - Seeded (Tier ${tier}, ${detail.columns.length} columns, ${commonFilters.length} filters)`);
      seededCount++;
    }

    console.log(`\n✅ Discovery complete!`);
    console.log(`   - Discovered: ${tables.length} tables`);
    console.log(`   - Analyzed: ${tableDetails.length} tables`);
    console.log(`   - Seeded: ${seededCount} new tables`);
    console.log(`   - Skipped: ${skippedCount} existing tables\n`);

    console.log('💡 Next steps:');
    console.log('   1. Review metadata at /data/explorer/metadata');
    console.log('   2. Edit descriptions and add sample questions for important tables');
    console.log('   3. Promote high-value tables to Tier 1');
    console.log('   4. Run discovery again to get remaining tables\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Discovery failed:', error);
    log.error('Schema discovery failed', error as Error, {
      operation: 'discover_schema',
    });
    process.exit(1);
  }
}

discoverRealTables();

