#!/usr/bin/env tsx

/**
 * Check DS #3 Column Mapping
 */

import path from 'node:path';
// Load environment variables from .env.local
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { columnMappingService } from '@/lib/services/column-mapping-service';

async function checkDS3Columns() {
  console.log('🔍 Checking DS #3 Column Mapping...\n');

  const service = columnMappingService;

  try {
    const mapping = await service.getMapping(3);

    console.log('📊 Column Mapping for DS #3:');
    console.log(JSON.stringify(mapping, null, 2));
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkDS3Columns()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
