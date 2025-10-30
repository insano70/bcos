/**
 * Query Pattern Analysis Background Job
 * Analyzes query history to extract and update patterns
 * 
 * Usage:
 *   pnpm exec tsx --env-file=.env.local scripts/analyze-query-patterns.ts
 */

import { db } from '@/lib/db';
import { explorerQueryHistory } from '@/lib/db/schema';
import { ExplorerPatternService } from '@/lib/services/data-explorer/explorer-pattern-service';
import { eq, gte, and } from 'drizzle-orm';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

// Mock user context for background job
const systemUserContext = {
  user_id: 'system',
  email: 'system@bendcare.com',
  first_name: 'System',
  last_name: 'Job',
  is_active: true,
  email_verified: true,
  is_super_admin: true,
  roles: [],
  organizations: [],
  accessible_organizations: [],
  user_roles: [],
  user_organizations: [],
  current_organization_id: 'system',
  all_permissions: [],
  organization_admin_for: [],
  accessible_practices: [],
};

async function analyzePatterns() {
  console.log('🔍 Analyzing query patterns from history...\n');

  try {
    const patternService = new ExplorerPatternService(systemUserContext as unknown as UserContext);

    // Get successful queries from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const successfulQueries = await db
      .select()
      .from(explorerQueryHistory)
      .where(
        and(
          eq(explorerQueryHistory.status, 'success'),
          gte(explorerQueryHistory.created_at, thirtyDaysAgo)
        )
      )
      .limit(1000);

    console.log(`Found ${successfulQueries.length} successful queries to analyze\n`);

    let patternsExtracted = 0;

    for (const query of successfulQueries) {
      try {
        const pattern = await patternService.extractPattern(
          query.natural_language_query,
          query.generated_sql,
          query.tables_used || []
        );

        await patternService.updatePatternUsage(
          pattern.pattern_type,
          pattern.natural_language_pattern,
          pattern.sql_pattern,
          pattern.tables_involved,
          true // Was successful
        );

        patternsExtracted++;
      } catch (error) {
        console.error(`Failed to extract pattern from query ${query.query_history_id}:`, error);
      }
    }

    console.log(`✅ Pattern analysis complete`);
    console.log(`   - Queries analyzed: ${successfulQueries.length}`);
    console.log(`   - Patterns extracted: ${patternsExtracted}\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Pattern analysis failed:', error);
    log.error('Pattern analysis job failed', error as Error, {
      operation: 'analyze_patterns',
    });
    process.exit(1);
  }
}

analyzePatterns();

