import { eq, and, desc, sql, } from 'drizzle-orm';
import { BaseRBACService } from '@/lib/rbac/base-service';
import { db } from '@/lib/db';
import {
  explorerQueryFeedback,
  explorerImprovementSuggestions,
} from '@/lib/db/schema';
import type { UserContext } from '@/lib/types/rbac';
import type {
  QueryFeedback,
  ImprovementSuggestion,
  SubmitFeedbackParams,
  ResolveFeedbackParams,
  FeedbackQueryOptions,
} from '@/lib/types/data-explorer';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';

export interface FeedbackServiceInterface {
  createFeedback(data: SubmitFeedbackParams): Promise<QueryFeedback>;
  listPendingFeedback(options?: FeedbackQueryOptions): Promise<QueryFeedback[]>;
  getFeedbackById(feedbackId: string): Promise<QueryFeedback | null>;
  resolveFeedback(
    feedbackId: string,
    data: ResolveFeedbackParams
  ): Promise<QueryFeedback>;
  getFeedbackCount(options?: FeedbackQueryOptions): Promise<number>;
  listSuggestions(feedbackId: string): Promise<ImprovementSuggestion[]>;
}

export class FeedbackService
  extends BaseRBACService
  implements FeedbackServiceInterface
{
  constructor(userContext: UserContext) {
    super(userContext, db);
  }

  /**
   * Create a new feedback entry
   */
  async createFeedback(data: SubmitFeedbackParams): Promise<QueryFeedback> {
    const startTime = Date.now();

    // RBAC check - any user with query permission can submit feedback
    this.requireAnyPermission([
      'data-explorer:query:organization',
      'data-explorer:query:all',
    ]);

    if (!this.dbContext) {
      throw new Error('Database context not initialized');
    }

    const result = await this.dbContext
      .insert(explorerQueryFeedback)
      .values({
        query_history_id: data.query_history_id,
        feedback_type: data.feedback_type,
        feedback_category: data.feedback_category,
        severity: data.severity,
        original_sql: data.original_sql,
        corrected_sql: data.corrected_sql || null,
        user_explanation: data.user_explanation || null,
        resolution_status: 'pending',
        created_by: this.userContext.user_id,
      })
      .returning();

    const feedback = result[0];
    if (!feedback) {
      throw new Error('Failed to create feedback');
    }

    const duration = Date.now() - startTime;

    log.info('Query feedback created', {
      operation: 'explorer_create_feedback',
      resourceType: 'explorer_feedback',
      resourceId: feedback.feedback_id,
      userId: this.userContext.user_id,
      feedbackType: data.feedback_type,
      severity: data.severity,
      duration,
      component: 'business-logic',
    });

    return feedback as QueryFeedback;
  }

  /**
   * List feedback with optional filtering
   */
  async listPendingFeedback(
    options: FeedbackQueryOptions = {}
  ): Promise<QueryFeedback[]> {
    const startTime = Date.now();

    // RBAC check - only admins can view all feedback
    this.requirePermission('data-explorer:manage:all');

    if (!this.dbContext) {
      throw new Error('Database context not initialized');
    }

    // Build conditions
    const conditions = [];

    if (options.status) {
      conditions.push(eq(explorerQueryFeedback.resolution_status, options.status));
    }

    if (options.severity) {
      conditions.push(eq(explorerQueryFeedback.severity, options.severity));
    }

    if (options.feedback_type) {
      conditions.push(eq(explorerQueryFeedback.feedback_type, options.feedback_type));
    }

    // Execute query
    const feedback = await this.dbContext
      .select()
      .from(explorerQueryFeedback)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(
        desc(explorerQueryFeedback.severity),
        desc(explorerQueryFeedback.created_at)
      )
      .limit(options.limit ?? 50)
      .offset(options.offset ?? 0);

    const duration = Date.now() - startTime;

    log.info('Feedback list query completed', {
      operation: 'explorer_list_feedback',
      resourceType: 'explorer_feedback',
      userId: this.userContext.user_id,
      results: { returned: feedback.length },
      duration,
      slow: duration > SLOW_THRESHOLDS.DB_QUERY,
      component: 'business-logic',
    });

    return feedback as QueryFeedback[];
  }

  /**
   * Get feedback by ID
   */
  async getFeedbackById(feedbackId: string): Promise<QueryFeedback | null> {
    // RBAC check
    this.requirePermission('data-explorer:manage:all');

    if (!this.dbContext) {
      throw new Error('Database context not initialized');
    }

    const result = await this.dbContext
      .select()
      .from(explorerQueryFeedback)
      .where(eq(explorerQueryFeedback.feedback_id, feedbackId))
      .limit(1);

    return result[0] ? (result[0] as QueryFeedback) : null;
  }

  /**
   * Resolve feedback
   */
  async resolveFeedback(
    feedbackId: string,
    data: ResolveFeedbackParams
  ): Promise<QueryFeedback> {
    const startTime = Date.now();

    // RBAC check - only admins can resolve feedback
    this.requirePermission('data-explorer:manage:all');

    if (!this.dbContext) {
      throw new Error('Database context not initialized');
    }

    const result = await this.dbContext
      .update(explorerQueryFeedback)
      .set({
        resolution_status: data.resolution_status,
        resolution_action: data.resolution_action || null,
        resolved_at: new Date(),
        resolved_by: this.userContext.user_id,
      })
      .where(eq(explorerQueryFeedback.feedback_id, feedbackId))
      .returning();

    const updated = result[0];
    if (!updated) {
      throw new Error('Feedback not found');
    }

    const duration = Date.now() - startTime;

    log.info('Feedback resolved', {
      operation: 'explorer_resolve_feedback',
      resourceType: 'explorer_feedback',
      resourceId: feedbackId,
      userId: this.userContext.user_id,
      resolutionStatus: data.resolution_status,
      duration,
      component: 'business-logic',
    });

    return updated as QueryFeedback;
  }

  /**
   * Get count of feedback entries
   */
  async getFeedbackCount(options: FeedbackQueryOptions = {}): Promise<number> {
    this.requirePermission('data-explorer:manage:all');

    if (!this.dbContext) {
      throw new Error('Database context not initialized');
    }

    const conditions = [];

    if (options.status) {
      conditions.push(eq(explorerQueryFeedback.resolution_status, options.status));
    }

    if (options.severity) {
      conditions.push(eq(explorerQueryFeedback.severity, options.severity));
    }

    if (options.feedback_type) {
      conditions.push(eq(explorerQueryFeedback.feedback_type, options.feedback_type));
    }

    const results = await this.dbContext
      .select({ count: sql<number>`count(*)` })
      .from(explorerQueryFeedback)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return results[0]?.count || 0;
  }

  /**
   * List improvement suggestions for a feedback entry
   */
  async listSuggestions(feedbackId: string): Promise<ImprovementSuggestion[]> {
    this.requirePermission('data-explorer:manage:all');

    if (!this.dbContext) {
      throw new Error('Database context not initialized');
    }

    const suggestions = await this.dbContext
      .select()
      .from(explorerImprovementSuggestions)
      .where(eq(explorerImprovementSuggestions.feedback_id, feedbackId))
      .orderBy(desc(explorerImprovementSuggestions.confidence_score));

    return suggestions as ImprovementSuggestion[];
  }
}

