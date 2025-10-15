#!/usr/bin/env node
/**
 * Debug Data Source Configuration
 * 
 * Usage: node scripts/debug-datasource.mjs <data_source_id>
 * 
 * Shows the configuration and structure of a data source
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import postgres from 'postgres';

const dataSourceId = process.argv[2] ? parseInt(process.argv[2], 10) : null;

if (!dataSourceId) {
  console.error('Usage: node scripts/debug-datasource.mjs <data_source_id>');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, {
  ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
});

async function main() {
  try {
    console.log(`🔍 Inspecting Data Source ID: ${dataSourceId}\n`);
    
    // Get data source config
    const [dataSource] = await sql`
      SELECT 
        data_source_id,
        data_source_name,
        data_source_description,
        table_name,
        schema_name,
        is_active
      FROM chart_data_sources
      WHERE data_source_id = ${dataSourceId}
    `;
    
    if (!dataSource) {
      console.error(`❌ Data source ${dataSourceId} not found`);
      process.exit(1);
    }
    
    console.log('📋 Data Source Configuration:');
    console.log(`   Name: ${dataSource.data_source_name}`);
    console.log(`   Table: ${dataSource.schema_name}.${dataSource.table_name}`);
    console.log(`   Active: ${dataSource.is_active}`);
    console.log(`   Description: ${dataSource.data_source_description || 'N/A'}\n`);
    
    // Get columns
    const columns = await sql`
      SELECT 
        column_name,
        display_name,
        data_type,
        is_date_field,
        is_time_period,
        is_measure,
        is_filterable,
        sort_order
      FROM chart_data_source_columns
      WHERE data_source_id = ${dataSourceId}
      ORDER BY sort_order, column_name
    `;
    
    console.log(`📊 Columns (${columns.length}):`);
    
    const dateField = columns.find(c => c.is_date_field && c.column_name !== columns.find(x => x.is_time_period)?.column_name);
    const timePeriodField = columns.find(c => c.is_time_period);
    const measureField = columns.find(c => c.is_measure);
    
    console.log('   🔑 Key Fields:');
    console.log(`      Date Field: ${dateField?.column_name || 'NOT FOUND'}`);
    console.log(`      Time Period Field: ${timePeriodField?.column_name || 'NOT FOUND'}`);
    console.log(`      Measure Field: ${measureField?.column_name || 'NOT FOUND'}\n`);
    
    console.log('   📝 All Columns:');
    for (const col of columns) {
      const flags = [];
      if (col.is_date_field) flags.push('DATE');
      if (col.is_time_period) flags.push('PERIOD');
      if (col.is_measure_field) flags.push('MEASURE');
      if (col.is_filterable) flags.push('FILTERABLE');
      
      console.log(`      - ${col.column_name} (${col.data_type})${flags.length > 0 ? ' [' + flags.join(', ') + ']' : ''}`);
    }
    
    // Try to query the actual table
    console.log(`\n🔍 Testing table access...`);
    
    try {
      const testQuery = `SELECT * FROM ${dataSource.schema_name}.${dataSource.table_name} LIMIT 1`;
      const [sampleRow] = await sql.unsafe(testQuery);
      
      if (sampleRow) {
        console.log('✅ Table is accessible\n');
        console.log('📄 Sample row columns:');
        console.log(`   ${Object.keys(sampleRow).join(', ')}\n`);
        
        // Check if key fields exist in actual table
        console.log('🔐 Validating key fields:');
        const actualColumns = Object.keys(sampleRow);
        
        if (dateField && !actualColumns.includes(dateField.column_name)) {
          console.log(`   ❌ Date field '${dateField.column_name}' NOT FOUND in table`);
        } else if (dateField) {
          console.log(`   ✅ Date field '${dateField.column_name}' exists`);
        }
        
        if (timePeriodField && !actualColumns.includes(timePeriodField.column_name)) {
          console.log(`   ❌ Time period field '${timePeriodField.column_name}' NOT FOUND in table`);
        } else if (timePeriodField) {
          console.log(`   ✅ Time period field '${timePeriodField.column_name}' exists`);
        }
        
        if (measureField && !actualColumns.includes(measureField.column_name)) {
          console.log(`   ❌ Measure field '${measureField.column_name}' NOT FOUND in table`);
        } else if (measureField) {
          console.log(`   ✅ Measure field '${measureField.column_name}' exists`);
        }
        
        // Check for standard columns
        console.log('\n📌 Standard columns:');
        const standardCols = ['practice_uid', 'provider_uid', 'measure'];
        for (const col of standardCols) {
          if (actualColumns.includes(col)) {
            console.log(`   ✅ ${col} exists`);
          } else {
            console.log(`   ❌ ${col} NOT FOUND`);
          }
        }
      } else {
        console.log('⚠️  Table is empty');
      }
    } catch (error) {
      console.error('❌ Error querying table:', error.message);
    }
    
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await sql.end();
    process.exit(1);
  }
}

main();

