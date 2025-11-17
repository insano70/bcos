#!/usr/bin/env tsx
/**
 * Provider Color Prepopulation Script
 *
 * Purpose: Pre-populate chart_provider_colors table with intelligent color
 * assignments based on provider revenue contribution.
 *
 * Strategy:
 * 1. Query data source ID 3 for total charges by provider
 * 2. Map providers to organizations via practice_uids
 * 3. Assign colors per organization in revenue descending order
 * 4. Insert into chart_provider_colors table
 *
 * Usage:
 *   pnpm tsx scripts/prepopulate-provider-colors.ts
 *   pnpm tsx scripts/prepopulate-provider-colors.ts --dry-run
 *   pnpm tsx scripts/prepopulate-provider-colors.ts --clear
 *   pnpm tsx scripts/prepopulate-provider-colors.ts --org-id=<uuid>
 */

import * as dotenv from 'dotenv';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/lib/db/schema';
import { chart_data_sources } from '@/lib/db/chart-config-schema';

// Load environment variables from .env.local BEFORE creating connections
dotenv.config({ path: '.env.local' });

// Create database connections directly (avoid importing @/lib/db which loads env.ts)
const queryClient = postgres(process.env.DATABASE_URL!);
const db = drizzle(queryClient, { schema: { ...schema, chart_data_sources } });

// Analytics database connection (AWS RDS requires SSL)
const analyticsClient = postgres(process.env.ANALYTICS_DATABASE_URL || process.env.DATABASE_URL!, {
  ssl: 'require', // AWS RDS requires SSL
});
const analyticsDb = drizzle(analyticsClient);

// Simple console logger (avoid importing @/lib/logger which loads env.ts)
const log = {
  info: (message: string, data?: Record<string, unknown>) => {
    console.log(`ℹ️  ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  warn: (message: string, data?: Record<string, unknown>) => {
    console.warn(`⚠️  ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  error: (message: string, error: unknown, data?: Record<string, unknown>) => {
    console.error(`❌ ${message}`, error, data ? JSON.stringify(data, null, 2) : '');
  },
  debug: (message: string, data?: Record<string, unknown>) => {
    console.log(`🔍 ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
};

// HARDCODED VALUES
const DATA_SOURCE_ID = 3;
const MEASURE_NAME = 'Charges';
const ANALYTICS_SCHEMA = 'ih';
const ANALYTICS_TABLE = 'agg_chart_data';

// Tableau 20 palette (from color-palettes.ts)
const TABLEAU_20_COLORS = [
  '#1f77b4',
  '#aec7e8',
  '#2ca02c',
  '#98df8a',
  '#d62728',
  '#ff9896',
  '#9467bd',
  '#c5b0d5',
  '#8c564b',
  '#c49c94',
  '#e377c2',
  '#f7b6d2',
  '#7f7f7f',
  '#c7c7c7',
  '#ff7f0e',
  '#ffbb78',
  '#bcbd22',
  '#dbdb8d',
  '#17becf',
  '#9edae5',
];

interface ProviderRevenue {
  provider_uid: number;
  provider_name: string;
  practice_uid: number;
  total_charges: number;
}

interface ProviderColorAssignment {
  organization_id: string;
  provider_uid: number;
  provider_name: string;
  assigned_color: string;
  rank: number;
  total_charges: number;
}

/**
 * Parse command-line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const clearExisting = args.includes('--clear');
  const orgIdArg = args.find((arg) => arg.startsWith('--org-id='));
  const specificOrgId = orgIdArg ? orgIdArg.split('=')[1] : undefined;

  return { dryRun, clearExisting, specificOrgId };
}

/**
 * Get data source metadata (hardcoded for data source ID 3)
 */
async function getDataSource(): Promise<{
  schema_name: string;
  table_name: string;
  data_source_name: string;
}> {
  log.info('Using hardcoded data source configuration', {
    dataSourceId: DATA_SOURCE_ID,
    schema: ANALYTICS_SCHEMA,
    table: ANALYTICS_TABLE,
  });

  return {
    schema_name: ANALYTICS_SCHEMA,
    table_name: ANALYTICS_TABLE,
    data_source_name: `Data Source ${DATA_SOURCE_ID}`,
  };
}

/**
 * Load active organizations (optionally filtered by ID)
 */
async function loadOrganizations(specificOrgId?: string) {
  const whereConditions = [eq(schema.organizations.is_active, true)];

  if (specificOrgId) {
    whereConditions.push(eq(schema.organizations.organization_id, specificOrgId));
  }

  const orgs = await db
    .select({
      organization_id: schema.organizations.organization_id,
      organization_name: schema.organizations.name,
      practice_uids: schema.organizations.practice_uids,
    })
    .from(schema.organizations)
    .where(and(...whereConditions));

  if (orgs.length === 0) {
    throw new Error(
      specificOrgId
        ? `Organization ${specificOrgId} not found or inactive`
        : 'No active organizations found'
    );
  }

  log.info('Organizations loaded', {
    count: orgs.length,
    filtered: Boolean(specificOrgId),
  });

  return orgs;
}

/**
 * Query provider charges from analytics database
 */
async function queryProviderCharges(
  schema: string,
  table: string
): Promise<ProviderRevenue[]> {
  // Build query to aggregate charges by provider
  // Note: ih.agg_chart_data uses numeric_value column
  const query = `
    SELECT
      provider_uid,
      MAX(provider_name) as provider_name,
      practice_uid,
      SUM(CAST(numeric_value AS DECIMAL)) as total_charges
    FROM ${schema}.${table}
    WHERE measure = '${MEASURE_NAME}'
      AND provider_uid IS NOT NULL
      AND provider_name IS NOT NULL
      AND practice_uid IS NOT NULL
    GROUP BY provider_uid, practice_uid
    ORDER BY total_charges DESC
  `;

  log.info('Querying provider charges', {
    schema,
    table,
    measure: MEASURE_NAME,
  });

  const result = await analyticsDb.execute(sql.raw(query));
  const rows = result as unknown as ProviderRevenue[];

  log.info('Provider charges queried', {
    providerCount: rows.length,
    topProvider: rows[0]
      ? {
          name: rows[0].provider_name,
          charges: rows[0].total_charges,
        }
      : null,
  });

  return rows;
}

/**
 * Map providers to organizations based on practice_uids
 */
function mapProvidersToOrganizations(
  providerRevenues: ProviderRevenue[],
  orgs: Array<{
    organization_id: string;
    organization_name: string;
    practice_uids: number[] | null;
  }>
): Map<string, ProviderRevenue[]> {
  const orgProviderMap = new Map<string, ProviderRevenue[]>();

  // Build practice_uid → organization_id lookup
  const practiceToOrg = new Map<number, { orgId: string; orgName: string }>();
  for (const org of orgs) {
    if (!org.practice_uids || org.practice_uids.length === 0) {
      log.warn('Organization has no practice UIDs', {
        organizationId: org.organization_id,
        organizationName: org.organization_name,
      });
      continue;
    }

    for (const practiceUid of org.practice_uids) {
      practiceToOrg.set(practiceUid, {
        orgId: org.organization_id,
        orgName: org.organization_name,
      });
    }
  }

  log.info('Practice-to-organization mapping built', {
    totalPractices: practiceToOrg.size,
  });

  // Map providers to organizations
  let unmappedCount = 0;
  for (const provider of providerRevenues) {
    const orgInfo = practiceToOrg.get(provider.practice_uid);

    if (!orgInfo) {
      log.warn('Provider practice not mapped to any organization', {
        provider_uid: provider.provider_uid,
        practice_uid: provider.practice_uid,
        provider_name: provider.provider_name,
      });
      unmappedCount++;
      continue;
    }

    if (!orgProviderMap.has(orgInfo.orgId)) {
      orgProviderMap.set(orgInfo.orgId, []);
    }
    const providerList = orgProviderMap.get(orgInfo.orgId);
    if (providerList) {
      providerList.push(provider);
    }
  }

  if (unmappedCount > 0) {
    log.warn('Some providers could not be mapped to organizations', {
      unmappedCount,
      totalProviders: providerRevenues.length,
    });
  }

  log.info('Provider-to-organization mapping complete', {
    organizationCount: orgProviderMap.size,
    totalProviderMappings: providerRevenues.length - unmappedCount,
  });

  return orgProviderMap;
}

/**
 * Assign colors to providers based on revenue rank within each organization
 */
function assignColors(
  orgProviderMap: Map<string, ProviderRevenue[]>,
  orgs: Array<{ organization_id: string; organization_name: string }>
): ProviderColorAssignment[] {
  const assignments: ProviderColorAssignment[] = [];
  const orgNameMap = new Map(orgs.map((o) => [o.organization_id, o.organization_name]));

  // Convert Map to array for iteration
  const orgProviderEntries = Array.from(orgProviderMap.entries());

  for (const [orgId, providers] of orgProviderEntries) {
    // Sort by total charges descending
    const sortedProviders = [...providers].sort((a, b) => b.total_charges - a.total_charges);

    // Assign colors in order (wraparound for > 20 providers)
    for (let i = 0; i < sortedProviders.length; i++) {
      const provider = sortedProviders[i];
      if (!provider) continue; // Skip undefined (shouldn't happen, but type safety)

      const colorIndex = i % TABLEAU_20_COLORS.length;
      const assignedColor = TABLEAU_20_COLORS[colorIndex] ?? '#1f77b4'; // Fallback

      assignments.push({
        organization_id: orgId,
        provider_uid: provider.provider_uid,
        provider_name: provider.provider_name,
        assigned_color: assignedColor,
        rank: i + 1,
        total_charges: provider.total_charges,
      });
    }

    log.info('Colors assigned for organization', {
      organizationId: orgId,
      organizationName: orgNameMap.get(orgId),
      providerCount: sortedProviders.length,
      colorsUsed: Math.min(sortedProviders.length, TABLEAU_20_COLORS.length),
      topProvider: sortedProviders[0]?.provider_name,
      topColor: TABLEAU_20_COLORS[0],
    });
  }

  return assignments;
}

/**
 * Insert provider color assignments into database
 */
async function insertProviderColors(
  assignments: ProviderColorAssignment[],
  dryRun: boolean,
  clearExisting: boolean
): Promise<void> {
  if (dryRun) {
    log.info('DRY RUN: Would insert provider color assignments', {
      count: assignments.length,
    });

    // Show first 20 assignments
    console.log('\n📊 Preview of color assignments (first 20):');
    console.table(
      assignments.slice(0, 20).map((a) => ({
        org: `${a.organization_id.slice(0, 8)}...`,
        provider_uid: a.provider_uid,
        provider_name: a.provider_name,
        color: a.assigned_color,
        rank: a.rank,
        charges: `$${a.total_charges.toLocaleString()}`,
      }))
    );

    // Summary by organization
    const orgSummary = new Map<string, number>();
    for (const a of assignments) {
      orgSummary.set(a.organization_id, (orgSummary.get(a.organization_id) || 0) + 1);
    }

    console.log('\n📈 Summary by organization:');
    console.table(
      Array.from(orgSummary.entries()).map(([orgId, count]) => ({
        organization_id: orgId,
        provider_count: count,
      }))
    );

    return;
  }

  // Clear existing assignments if requested
  if (clearExisting) {
    log.info('Clearing existing provider color assignments');
    await db.delete(schema.chart_provider_colors);
    log.info('Existing assignments cleared');
  }

  // Batch insert (chunks of 100)
  const batchSize = 100;
  let inserted = 0;

  for (let i = 0; i < assignments.length; i += batchSize) {
    const batch = assignments.slice(i, i + batchSize);

    await db.insert(schema.chart_provider_colors).values(
      batch.map((a) => ({
        organization_id: a.organization_id,
        provider_uid: a.provider_uid,
        provider_name: a.provider_name,
        assigned_color: a.assigned_color,
        color_palette_id: 'tableau20',
        is_custom: false,
        created_by: null, // System-generated
        updated_by: null,
      }))
    );

    inserted += batch.length;
    log.info('Batch inserted', {
      batch: Math.floor(i / batchSize) + 1,
      totalBatches: Math.ceil(assignments.length / batchSize),
      inserted,
    });
  }

  log.info('Provider color assignments inserted successfully', {
    totalInserted: inserted,
  });
}

/**
 * Main execution function
 */
async function main() {
  const { dryRun, clearExisting, specificOrgId } = parseArgs();

  log.info('Provider color prepopulation started', {
    dataSourceId: DATA_SOURCE_ID,
    measure: MEASURE_NAME,
    dryRun,
    clearExisting,
    specificOrgId: specificOrgId || 'all',
  });

  try {
    // Step 1: Get data source metadata
    const dataSource = await getDataSource();

    // Step 2: Load organizations
    const orgs = await loadOrganizations(specificOrgId);

    // Step 3: Query provider charges
    const providerRevenues = await queryProviderCharges(
      dataSource.schema_name,
      dataSource.table_name
    );

    if (providerRevenues.length === 0) {
      log.warn('No provider revenue data found', {
        dataSourceId: DATA_SOURCE_ID,
        measure: MEASURE_NAME,
      });
      console.log('⚠️  No provider revenue data found. Exiting.');
      process.exit(0);
    }

    // Step 4: Map providers to organizations
    const orgProviderMap = mapProvidersToOrganizations(providerRevenues, orgs);

    if (orgProviderMap.size === 0) {
      log.warn('No providers could be mapped to organizations');
      console.log('⚠️  No providers could be mapped to organizations. Exiting.');
      process.exit(0);
    }

    // Step 5: Assign colors
    const assignments = assignColors(orgProviderMap, orgs);

    // Step 6: Insert into database
    await insertProviderColors(assignments, dryRun, clearExisting);

    log.info('Provider color prepopulation completed successfully', {
      totalAssignments: assignments.length,
      organizationCount: orgProviderMap.size,
    });

    console.log(
      `\n✅ Successfully ${dryRun ? 'previewed' : 'inserted'} ${assignments.length} provider color assignments across ${orgProviderMap.size} organization(s)`
    );

    process.exit(0);
  } catch (error) {
    log.error('Provider color prepopulation failed', error, {
      dataSourceId: DATA_SOURCE_ID,
      measure: MEASURE_NAME,
    });
    console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

// Run the script
main();
