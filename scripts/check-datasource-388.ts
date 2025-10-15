#!/usr/bin/env tsx
/**
 * Check Data Source 388 Configuration
 */

// Load environment variables from .env.local
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { chartConfigService } from '@/lib/services/chart-config-service';

async function checkDataSource() {
  console.log('🔍 Checking Data Source 388 configuration...\n');
  
  try {
    const config = await chartConfigService.getDataSourceConfigById(388);
    
    if (!config) {
      console.log('❌ Data source 388 not found');
      return;
    }
    
    console.log('📊 Data Source:', config.name);
    console.log('   Description:', config.description || 'N/A');
    console.log('   Schema:', config.schemaName);
    console.log('   Table:', config.tableName);
    console.log('   Active:', config.isActive);
    console.log('\n📝 Columns:');
    
    for (const col of config.columns) {
      console.log(`   - ${col.columnName} (${col.dataType})`);
      console.log(`     Display: ${col.displayName}`);
      console.log(`     Measure: ${col.isMeasure}, Dimension: ${col.isDimension}, Date: ${col.isDateField}`);
      console.log(`     Filterable: ${col.isFilterable}, Groupable: ${col.isGroupable}`);
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkDataSource()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });

