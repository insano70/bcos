/**
 * Dimension Discovery Performance Benchmark
 *
 * Compares old vs new dimension discovery approach:
 * - OLD: Fetch all rows → extract unique values in-memory
 * - NEW: SQL DISTINCT + COUNT with Redis caching
 *
 * Usage:
 * ```bash
 * tsx scripts/benchmark-dimension-discovery.ts
 * ```
 *
 * Requirements:
 * - DATABASE_URL must be set
 * - REDIS_HOST must be set
 * - Database must have analytics data (100K+ rows recommended)
 */

import { dimensionValueCache } from '@/lib/services/analytics/dimension-value-cache';
import { dataSourceCache } from '@/lib/cache';
import type { UserContext } from '@/lib/types/rbac';
import { chartConfigService } from '@/lib/services/chart-config-service';

/**
 * Mock user context for testing (super admin with full access)
 */
const mockUserContext: UserContext = {
  user_id: '00000000-0000-0000-0000-000000000000',
  email: 'benchmark@test.local',
  first_name: 'Benchmark',
  last_name: 'User',
  is_active: true,
  email_verified: true,
  roles: [],
  organizations: [],
  accessible_organizations: [],
  user_roles: [],
  user_organizations: [],
  all_permissions: [],
  is_super_admin: true,
  organization_admin_for: [],
};

/**
 * Benchmark configuration
 */
interface BenchmarkConfig {
  dataSourceId: number;
  dimensionColumn: string;
  measure: string;
  frequency: string;
  iterations: number;
}

/**
 * Benchmark result
 */
interface BenchmarkResult {
  approach: 'OLD (in-memory)' | 'NEW (SQL DISTINCT)';
  avgTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  iterations: number;
  cacheHits: number;
  valueCount: number;
}

/**
 * Run OLD approach (fetch all rows, extract unique in-memory)
 */
async function benchmarkOldApproach(config: BenchmarkConfig): Promise<BenchmarkResult> {
  const times: number[] = [];
  let valueCount = 0;
  let cacheHits = 0;

  console.log(`\n📊 Benchmarking OLD approach (${config.iterations} iterations)...`);

  for (let i = 0; i < config.iterations; i++) {
    const startTime = Date.now();

    // OLD APPROACH: Fetch all rows from cache
    const result = await dataSourceCache.fetchDataSource(
      {
        dataSourceId: config.dataSourceId,
        schema: 'analytics',
        table: 'analytics_dual_axis', // Adjust based on your data source
        dataSourceType: 'measure-based',
        measure: config.measure,
        frequency: config.frequency,
      },
      mockUserContext,
      i === 0 // No cache on first iteration
    );

    // Extract unique dimension values in-memory
    const uniqueValues = new Set<string | number>();
    for (const row of result.rows) {
      const value = row[config.dimensionColumn];
      if (value !== null && value !== undefined) {
        uniqueValues.add(value as string | number);
      }
    }

    const duration = Date.now() - startTime;
    times.push(duration);

    if (result.cacheHit) cacheHits++;
    valueCount = uniqueValues.size;

    console.log(`  Iteration ${i + 1}: ${duration}ms (${result.rows.length} rows, ${uniqueValues.size} unique values)`);
  }

  return {
    approach: 'OLD (in-memory)',
    avgTimeMs: times.reduce((sum, t) => sum + t, 0) / times.length,
    minTimeMs: Math.min(...times),
    maxTimeMs: Math.max(...times),
    iterations: config.iterations,
    cacheHits,
    valueCount,
  };
}

/**
 * Run NEW approach (SQL DISTINCT with Redis caching)
 */
async function benchmarkNewApproach(config: BenchmarkConfig): Promise<BenchmarkResult> {
  const times: number[] = [];
  let valueCount = 0;
  let cacheHits = 0;

  console.log(`\n⚡ Benchmarking NEW approach (${config.iterations} iterations)...`);

  // Clear dimension cache to ensure fair comparison
  await dimensionValueCache.invalidateCache(config.dataSourceId, config.dimensionColumn);

  for (let i = 0; i < config.iterations; i++) {
    const startTime = Date.now();

    // NEW APPROACH: Optimized SQL DISTINCT + COUNT
    const result = await dimensionValueCache.getDimensionValues(
      {
        dataSourceId: config.dataSourceId,
        dimensionColumn: config.dimensionColumn,
        measure: config.measure,
        frequency: config.frequency,
        limit: 50,
      },
      mockUserContext
    );

    const duration = Date.now() - startTime;
    times.push(duration);

    if (result.fromCache) cacheHits++;
    valueCount = result.values.length;

    console.log(`  Iteration ${i + 1}: ${duration}ms (${result.values.length} unique values, cache: ${result.fromCache})`);
  }

  return {
    approach: 'NEW (SQL DISTINCT)',
    avgTimeMs: times.reduce((sum, t) => sum + t, 0) / times.length,
    minTimeMs: Math.min(...times),
    maxTimeMs: Math.max(...times),
    iterations: config.iterations,
    cacheHits,
    valueCount,
  };
}

/**
 * Print comparison results
 */
function printComparison(oldResult: BenchmarkResult, newResult: BenchmarkResult): void {
  console.log(`\n${'='.repeat(80)}`);
  console.log('📈 PERFORMANCE COMPARISON');
  console.log('='.repeat(80));

  console.log('\n📊 OLD Approach (In-Memory Filtering):');
  console.log(`  Average Time: ${oldResult.avgTimeMs.toFixed(2)}ms`);
  console.log(`  Min Time: ${oldResult.minTimeMs}ms`);
  console.log(`  Max Time: ${oldResult.maxTimeMs}ms`);
  console.log(`  Cache Hits: ${oldResult.cacheHits}/${oldResult.iterations}`);
  console.log(`  Values Found: ${oldResult.valueCount}`);

  console.log('\n⚡ NEW Approach (SQL DISTINCT):');
  console.log(`  Average Time: ${newResult.avgTimeMs.toFixed(2)}ms`);
  console.log(`  Min Time: ${newResult.minTimeMs}ms`);
  console.log(`  Max Time: ${newResult.maxTimeMs}ms`);
  console.log(`  Cache Hits: ${newResult.cacheHits}/${newResult.iterations}`);
  console.log(`  Values Found: ${newResult.valueCount}`);

  const improvement = ((oldResult.avgTimeMs - newResult.avgTimeMs) / oldResult.avgTimeMs) * 100;
  const speedup = oldResult.avgTimeMs / newResult.avgTimeMs;

  console.log('\n🎯 IMPROVEMENT:');
  console.log(`  ${improvement > 0 ? '✅' : '❌'} ${Math.abs(improvement).toFixed(1)}% ${improvement > 0 ? 'faster' : 'slower'}`);
  console.log(`  ${speedup.toFixed(1)}x speedup`);
  console.log(`  Saves ${(oldResult.avgTimeMs - newResult.avgTimeMs).toFixed(2)}ms per query`);

  console.log(`\n${'='.repeat(80)}`);
}

/**
 * Main benchmark execution
 */
async function main(): Promise<void> {
  console.log('🚀 Dimension Discovery Performance Benchmark');
  console.log('='.repeat(80));

  // Get available data sources
  const dataSources = await chartConfigService.getAllDataSources();

  if (dataSources.length === 0) {
    console.error('❌ No data sources found. Please seed the database first.');
    process.exit(1);
  }

  // Use first data source
  const dataSource = dataSources[0];
  if (!dataSource) {
    console.error('❌ No data source available');
    process.exit(1);
  }

  console.log(`\n📋 Using Data Source: ${dataSource.name} (ID: ${dataSource.id})`);

  // Get expansion dimensions
  const config = await chartConfigService.getDataSourceConfigById(dataSource.id);
  if (!config) {
    console.error('❌ Data source configuration not found');
    process.exit(1);
  }

  const expansionDimensions = config.columns.filter((col) => col.isExpansionDimension);

  if (expansionDimensions.length === 0) {
    console.error('❌ No expansion dimensions found. Please configure dimensions first.');
    process.exit(1);
  }

  const dimensionColumn = expansionDimensions[0]?.columnName;
  if (!dimensionColumn) {
    console.error('❌ No dimension column found');
    process.exit(1);
  }

  console.log(`📐 Dimension Column: ${dimensionColumn}`);

  // Configure benchmark
  const benchmarkConfig: BenchmarkConfig = {
    dataSourceId: dataSource.id,
    dimensionColumn,
    measure: 'AR', // Adjust based on your data
    frequency: 'Monthly',
    iterations: 5, // 5 iterations for averaging
  };

  console.log(`\n⚙️  Configuration:`);
  console.log(`   Data Source ID: ${benchmarkConfig.dataSourceId}`);
  console.log(`   Dimension: ${benchmarkConfig.dimensionColumn}`);
  console.log(`   Measure: ${benchmarkConfig.measure}`);
  console.log(`   Frequency: ${benchmarkConfig.frequency}`);
  console.log(`   Iterations: ${benchmarkConfig.iterations}`);

  try {
    // Run benchmarks
    const oldResult = await benchmarkOldApproach(benchmarkConfig);
    const newResult = await benchmarkNewApproach(benchmarkConfig);

    // Print comparison
    printComparison(oldResult, newResult);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Benchmark failed:', error);
    process.exit(1);
  }
}

// Run benchmark
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

