import { BaseRBACService } from '@/lib/rbac/base-service';
import { db } from '@/lib/db';
import { executeAnalyticsQuery, checkAnalyticsDbHealth } from '@/lib/services/analytics-db';
import { createRBACExplorerQuerySecurityService } from './index';
import type { UserContext } from '@/lib/types/rbac';
import type { ExecuteQueryOptions, ExecuteQueryResult } from '@/lib/types/data-explorer';
import { env } from '@/lib/env';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';

export interface QueryExecutorInterface {
  execute(sql: string, options?: ExecuteQueryOptions): Promise<ExecuteQueryResult>;
  validateSQL(sql: string): Promise<{ isValid: boolean; errors: string[] }>;
  explainQuery(sql: string): Promise<unknown>;
}

export class QueryExecutorService extends BaseRBACService implements QueryExecutorInterface {
  constructor(userContext: UserContext) {
    super(userContext, db);
  }

  async execute(sql: string, options: ExecuteQueryOptions = {}): Promise<ExecuteQueryResult> {
    const startTime = Date.now();

    this.requireAnyPermission([
      'data-explorer:execute:own',
      'data-explorer:execute:organization',
      'data-explorer:execute:all',
    ]);

    const { isHealthy, error: healthError } = await checkAnalyticsDbHealth();
    if (!isHealthy) {
      throw new Error(`Analytics database unavailable: ${healthError || 'Unknown error'}`);
    }

    const securityService = createRBACExplorerQuerySecurityService(this.userContext);
    const securedSQL = await securityService.addSecurityFilters(sql);

    const finalSQL = this.ensureLimit(securedSQL, options.limit);
    const timeout = options.timeout_ms || env.DATA_EXPLORER_QUERY_TIMEOUT_MS;

    try {
      const results = await Promise.race([
        executeAnalyticsQuery(finalSQL),
        this.createTimeout(timeout),
      ]);

      const duration = Date.now() - startTime;

      log.info('Analytics query executed', {
        operation: 'explorer_execute_query',
        resourceType: 'explorer_query',
        userId: this.userContext.user_id,
        organizationId: this.userContext.current_organization_id,
        duration,
        slow: duration > SLOW_THRESHOLDS.API_OPERATION,
        rowCount: Array.isArray(results) ? (results as unknown[]).length : 0,
        component: 'analytics-db',
      });

      const rows = (results as unknown) as Array<Record<string, string | number | boolean | null | undefined>>;
      return {
        rows,
        row_count: rows.length,
        execution_time_ms: duration,
        columns:
          rows.length > 0 && rows[0]
            ? Object.keys(rows[0] as object).map((name) => ({ name, type: 'unknown' }))
            : [],
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      log.error('Analytics query execution failed', error as Error, {
        operation: 'explorer_execute_query',
        userId: this.userContext.user_id,
        duration,
        component: 'analytics-db',
      });
      throw new Error(`Query execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async validateSQL(sql: string): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    const destructive = [/\bDROP\b/i, /\bTRUNCATE\b/i, /\bDELETE\b/i, /\bINSERT\b/i, /\bUPDATE\b/i, /\bALTER\b/i, /\bCREATE\b/i];
    for (const pattern of destructive) {
      if (pattern.test(sql)) errors.push(`Destructive operation not allowed: ${pattern}`);
    }

    if (!sql.includes('ih.')) errors.push('Query must reference tables using "ih." schema prefix');

    return { isValid: errors.length === 0, errors };
  }

  async explainQuery(sql: string): Promise<unknown> {
    this.requireAnyPermission(['data-explorer:execute:organization', 'data-explorer:execute:all']);
    const explainSQL = `EXPLAIN (FORMAT JSON, ANALYZE false) ${sql}`;
    const result = await executeAnalyticsQuery<Record<string, unknown>>(explainSQL);
    return Array.isArray(result) && result.length > 0 ? result[0] : {};
  }

  private ensureLimit(sql: string, limit?: number): string {
    const maxLimit = limit || env.DATA_EXPLORER_MAX_ROWS;
    if (/\bLIMIT\s+\d+/i.test(sql)) return sql;
    return `${sql}\nLIMIT ${maxLimit}`;
  }

  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Query timeout after ${ms}ms`)), ms);
    });
  }
}
