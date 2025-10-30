import { BaseRBACService } from '@/lib/rbac/base-service';
import { db } from '@/lib/db';
import { explorerQueryHistory } from '@/lib/db/schema';
import type { UserContext } from '@/lib/types/rbac';
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';

export interface CreateHistoryInput {
  natural_language_query: string;
  generated_sql: string;
  status: string;
  model_used: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  tables_used?: string[];
  user_id: string;
  user_email?: string | null;
  organization_id?: string | null;
}

export class ExplorerHistoryService extends BaseRBACService {
  constructor(userContext: UserContext) {
    super(userContext, db);
  }

  async createHistoryEntry(input: CreateHistoryInput) {
    this.requireAnyPermission([
      'data-explorer:read:organization',
      'data-explorer:read:all',
      'data-explorer:query:organization',
      'data-explorer:query:all',
    ]);

    if (!this.dbContext) throw new Error('Database context not initialized');
    const [row] = await this.dbContext
      .insert(explorerQueryHistory)
      .values({
        natural_language_query: input.natural_language_query,
        generated_sql: input.generated_sql,
        status: input.status,
        model_used: input.model_used,
        prompt_tokens: input.prompt_tokens,
        completion_tokens: input.completion_tokens,
        tables_used: input.tables_used,
        user_id: input.user_id,
        user_email: input.user_email,
        organization_id: input.organization_id,
        // Store original generated SQL for edit detection
        original_generated_sql: input.generated_sql,
        was_sql_edited: false,
        sql_edit_count: 0,
      })
      .returning();

    if (!row) throw new Error('Failed to create history entry');
    return row;
  }

  async updateHistoryEntry(id: string, changes: Record<string, unknown>) {
    this.requireAnyPermission([
      'data-explorer:read:organization',
      'data-explorer:read:all',
    ]);

    if (!this.dbContext) throw new Error('Database context not initialized');
    
    // If final_sql is being set, check if it differs from original generated SQL
    if (changes.final_sql && typeof changes.final_sql === 'string') {
      // Fetch the original entry to compare
      const [existing] = await this.dbContext
        .select({
          original_generated_sql: explorerQueryHistory.original_generated_sql,
          sql_edit_count: explorerQueryHistory.sql_edit_count,
        })
        .from(explorerQueryHistory)
        .where(eq(explorerQueryHistory.query_history_id, id))
        .limit(1);

      if (existing?.original_generated_sql) {
        // Normalize SQL for comparison (remove extra whitespace, case-insensitive)
        const normalizeSQL = (sql: string) => 
          sql.trim().replace(/\s+/g, ' ').toLowerCase();

        const originalNormalized = normalizeSQL(existing.original_generated_sql);
        const finalNormalized = normalizeSQL(changes.final_sql);

        if (originalNormalized !== finalNormalized) {
          // SQL was edited!
          changes.was_sql_edited = true;
          changes.sql_edit_count = (existing.sql_edit_count || 0) + 1;
        }
      }
    }

    const [row] = await this.dbContext
      .update(explorerQueryHistory)
      .set(changes)
      .where(eq(explorerQueryHistory.query_history_id, id))
      .returning();

    return row || null;
  }

  async listHistory(params?: { limit?: number; offset?: number; status?: string }) {
    this.requireAnyPermission([
      'data-explorer:read:organization',
      'data-explorer:read:all',
    ]);

    const conditions: SQL[] = [];
    if (params?.status) conditions.push(eq(explorerQueryHistory.status, params.status));

    if (!this.dbContext) throw new Error('Database context not initialized');
    const items = await this.dbContext
      .select()
      .from(explorerQueryHistory)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(explorerQueryHistory.created_at))
      .limit(params?.limit ?? 50)
      .offset(params?.offset ?? 0);

    const [{ count } = { count: 0 }] = await this.dbContext
      .select({ count: sql<number>`count(*)` })
      .from(explorerQueryHistory)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return { items, total: count };
  }

  async getQueryById(queryId: string) {
    this.requireAnyPermission([
      'data-explorer:read:organization',
      'data-explorer:read:all',
    ]);

    if (!this.dbContext) throw new Error('Database context not initialized');
    const [query] = await this.dbContext
      .select()
      .from(explorerQueryHistory)
      .where(eq(explorerQueryHistory.query_history_id, queryId))
      .limit(1);

    return query || null;
  }

  async rateQuery(queryId: string, rating: 1 | 2 | 3 | 4 | 5, feedback?: string) {
    this.requireAnyPermission([
      'data-explorer:read:organization',
      'data-explorer:read:all',
    ]);

    if (!this.dbContext) throw new Error('Database context not initialized');
    const [updated] = await this.dbContext
      .update(explorerQueryHistory)
      .set({
        user_rating: rating,
        ...(feedback && { user_feedback: feedback }),
        was_helpful: rating >= 4,
      })
      .where(eq(explorerQueryHistory.query_history_id, queryId))
      .returning();

    return updated || null;
  }

  /**
   * Get statistics on SQL edits (admin only)
   * Useful for identifying when AI-generated SQL needs improvement
   */
  async getEditStatistics() {
    this.requirePermission('data-explorer:manage:all');

    if (!this.dbContext) throw new Error('Database context not initialized');

    // Get overall edit statistics
    const [stats] = await this.dbContext
      .select({
        total_queries: sql<number>`count(*)`,
        edited_queries: sql<number>`count(*) filter (where was_sql_edited = true)`,
        edit_percentage: sql<number>`round((count(*) filter (where was_sql_edited = true)::numeric / count(*)::numeric * 100), 2)`,
        avg_edits_per_query: sql<number>`round(avg(sql_edit_count), 2)`,
      })
      .from(explorerQueryHistory);

    // Get most frequently edited query patterns
    const editedQueries = await this.dbContext
      .select({
        natural_language_query: explorerQueryHistory.natural_language_query,
        edit_count: explorerQueryHistory.sql_edit_count,
        original_sql: explorerQueryHistory.original_generated_sql,
        final_sql: explorerQueryHistory.final_sql,
        tables_used: explorerQueryHistory.tables_used,
      })
      .from(explorerQueryHistory)
      .where(eq(explorerQueryHistory.was_sql_edited, true))
      .orderBy(desc(explorerQueryHistory.sql_edit_count))
      .limit(20);

    return {
      overall: stats,
      top_edited_queries: editedQueries,
    };
  }
}
