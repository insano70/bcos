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
      'data-explorer:history:read:own',
      'data-explorer:history:read:organization',
      'data-explorer:history:read:all',
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
      })
      .returning();

    if (!row) throw new Error('Failed to create history entry');
    return row;
  }

  async updateHistoryEntry(id: string, changes: Record<string, unknown>) {
    this.requireAnyPermission([
      'data-explorer:history:read:own',
      'data-explorer:history:read:organization',
      'data-explorer:history:read:all',
    ]);

    if (!this.dbContext) throw new Error('Database context not initialized');
    const [row] = await this.dbContext
      .update(explorerQueryHistory)
      .set(changes)
      .where(eq(explorerQueryHistory.query_history_id, id))
      .returning();

    return row || null;
  }

  async listHistory(params?: { limit?: number; offset?: number; status?: string }) {
    this.requireAnyPermission([
      'data-explorer:history:read:own',
      'data-explorer:history:read:organization',
      'data-explorer:history:read:all',
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
      'data-explorer:history:read:own',
      'data-explorer:history:read:organization',
      'data-explorer:history:read:all',
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
      'data-explorer:history:read:own',
      'data-explorer:history:read:organization',
      'data-explorer:history:read:all',
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
}
