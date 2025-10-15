#!/usr/bin/env tsx
/**
 * Warm DS #3 Only (for debugging)
 */

// Load environment variables from .env.local
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { dataSourceCache } from '@/lib/cache/data-source-cache';

async function warmDS3() {
  console.log('🔥 Warming DS #3 only...\n');
  
  try {
    const result = await dataSourceCache.warmDataSource(3);
    
    console.log('\n✅ Result:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

warmDS3()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });

