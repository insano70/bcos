/**
 * Suggestion Generator
 * Creates actionable improvement suggestions from feedback analysis
 * Populates explorer_improvement_suggestions table
 */

import { BaseRBACService } from '@/lib/rbac/base-service';
import { db } from '@/lib/db';
import {
  explorerImprovementSuggestions,
  explorerQueryFeedback,
  explorerTableMetadata,
  explorerColumnMetadata,
} from '@/lib/db/schema';
import type { UserContext } from '@/lib/types/rbac';
import { eq, desc, sql } from 'drizzle-orm';
import { log } from '@/lib/logger';
import type { ImprovementSuggestion, QueryFeedback } from '@/lib/types/data-explorer';
import type { FeedbackAnalysisResult, SuggestedFix } from './feedback-analyzer';
import { analyzeFeedback } from './feedback-analyzer';

export class SuggestionGeneratorService extends BaseRBACService {
  constructor(userContext: UserContext) {
    super(userContext, db);
  }

  /**
   * Generate suggestions from a feedback entry
   */
  async generateSuggestionsFromFeedback(feedbackId: string): Promise<ImprovementSuggestion[]> {
    const startTime = Date.now();

    // RBAC check
    this.requirePermission('data-explorer:manage:all');

    if (!this.dbContext) throw new Error('Database context not initialized');

    // Get feedback
    const [feedback] = await this.dbContext
      .select()
      .from(explorerQueryFeedback)
      .where(eq(explorerQueryFeedback.feedback_id, feedbackId))
      .limit(1);

    if (!feedback) {
      throw new Error(`Feedback ${feedbackId} not found`);
    }

    // Analyze feedback using AI (cast to QueryFeedback for type safety)
    const analysis = await analyzeFeedback(feedback as unknown as QueryFeedback);

    // Generate suggestions from analysis
    const suggestions: ImprovementSuggestion[] = [];

    for (const fix of analysis.suggestedFixes) {
      const suggestion = await this.createSuggestion(feedbackId, fix, analysis);
      if (suggestion) {
        suggestions.push(suggestion);
      }
    }

    const duration = Date.now() - startTime;

    log.info('Suggestions generated from feedback', {
      operation: 'generate_suggestions_from_feedback',
      feedbackId,
      suggestionCount: suggestions.length,
      duration,
      component: 'business-logic',
    });

    return suggestions;
  }

  /**
   * Create a single suggestion
   */
  private async createSuggestion(
    feedbackId: string,
    fix: SuggestedFix,
    analysis: FeedbackAnalysisResult
  ): Promise<ImprovementSuggestion | null> {
    if (!this.dbContext) throw new Error('Database context not initialized');

    try {
      // Determine target ID based on type
      let targetId: string | null = null;

      if (fix.type === 'metadata') {
        // Find table or column ID
        targetId = await this.findMetadataTargetId(fix.target);
      }

      // Build suggested change object
      const suggestedChange = {
        type: fix.type,
        target: fix.target,
        action: fix.action,
        description: fix.description,
        detectedIssue: analysis.detectedIssue,
        rootCause: analysis.rootCause,
      };

      // Insert suggestion
      const [suggestion] = await this.dbContext
        .insert(explorerImprovementSuggestions)
        .values({
          feedback_id: feedbackId,
          suggestion_type: this.mapFixTypeToSuggestionType(fix.type),
          target_type: this.determineTargetType(fix.type),
          target_id: targetId,
          suggested_change: suggestedChange,
          confidence_score: String(fix.confidence),
          status: fix.confidence >= 0.8 ? 'pending' : 'pending', // Could auto-apply high confidence
        })
        .returning();

      return suggestion as ImprovementSuggestion;
    } catch (error) {
      log.error('Failed to create suggestion', error, {
        operation: 'create_suggestion',
        feedbackId,
        fixType: fix.type,
        component: 'business-logic',
      });
      return null;
    }
  }

  /**
   * Find metadata target ID (table or column)
   */
  private async findMetadataTargetId(target: string): Promise<string | null> {
    if (!this.dbContext) return null;

    // Try to find table
    const [table] = await this.dbContext
      .select({ table_metadata_id: explorerTableMetadata.table_metadata_id })
      .from(explorerTableMetadata)
      .where(eq(explorerTableMetadata.table_name, target))
      .limit(1);

    if (table) {
      return table.table_metadata_id;
    }

    // Try to find column
    const [column] = await this.dbContext
      .select({ column_metadata_id: explorerColumnMetadata.column_metadata_id })
      .from(explorerColumnMetadata)
      .where(eq(explorerColumnMetadata.column_name, target))
      .limit(1);

    if (column) {
      return column.column_metadata_id;
    }

    return null;
  }

  /**
   * Map fix type to suggestion type
   */
  private mapFixTypeToSuggestionType(
    fixType: string
  ): ImprovementSuggestion['suggestion_type'] {
    switch (fixType) {
      case 'metadata':
        return 'add_metadata';
      case 'instruction':
        return 'add_instruction';
      case 'relationship':
        return 'add_relationship';
      default:
        return 'add_metadata';
    }
  }

  /**
   * Determine target type
   */
  private determineTargetType(fixType: string): ImprovementSuggestion['target_type'] {
    switch (fixType) {
      case 'metadata':
        return 'column';
      case 'instruction':
        return 'instruction';
      case 'relationship':
        return 'relationship';
      default:
        return 'table';
    }
  }

  /**
   * Get pending suggestions
   */
  async getPendingSuggestions(limit = 50): Promise<ImprovementSuggestion[]> {
    this.requirePermission('data-explorer:manage:all');

    if (!this.dbContext) throw new Error('Database context not initialized');

    const suggestions = await this.dbContext
      .select()
      .from(explorerImprovementSuggestions)
      .where(eq(explorerImprovementSuggestions.status, 'pending'))
      .orderBy(desc(explorerImprovementSuggestions.confidence_score))
      .limit(limit);

    return suggestions as ImprovementSuggestion[];
  }

  /**
   * Approve and apply a suggestion
   */
  async approveSuggestion(suggestionId: string): Promise<ImprovementSuggestion> {
    const startTime = Date.now();

    this.requirePermission('data-explorer:manage:all');

    if (!this.dbContext) throw new Error('Database context not initialized');

    // Get suggestion
    const [suggestion] = await this.dbContext
      .select()
      .from(explorerImprovementSuggestions)
      .where(eq(explorerImprovementSuggestions.suggestion_id, suggestionId))
      .limit(1);

    if (!suggestion) {
      throw new Error(`Suggestion ${suggestionId} not found`);
    }

    // Apply the suggestion based on type
    await this.applySuggestion(suggestion as ImprovementSuggestion);

    // Update suggestion status
    const [updated] = await this.dbContext
      .update(explorerImprovementSuggestions)
      .set({
        status: 'approved',
        applied_at: new Date(),
        applied_by: this.userContext.user_id,
      })
      .where(eq(explorerImprovementSuggestions.suggestion_id, suggestionId))
      .returning();

    const duration = Date.now() - startTime;

    log.info('Suggestion approved and applied', {
      operation: 'approve_suggestion',
      suggestionId,
      suggestionType: suggestion.suggestion_type,
      duration,
      component: 'business-logic',
    });

    return updated as ImprovementSuggestion;
  }

  /**
   * Apply a suggestion to the metadata
   */
  private async applySuggestion(suggestion: ImprovementSuggestion): Promise<void> {
    if (!this.dbContext) throw new Error('Database context not initialized');

    const change = suggestion.suggested_change as {
      target: string;
      action: string;
      description: string;
    };

    switch (suggestion.suggestion_type) {
      case 'add_metadata':
        await this.applyMetadataSuggestion(change);
        break;
      case 'add_instruction':
        await this.applyInstructionSuggestion(change);
        break;
      case 'add_relationship':
        await this.applyRelationshipSuggestion(change);
        break;
      default:
        log.warn('Unknown suggestion type', {
          suggestionType: suggestion.suggestion_type,
          component: 'business-logic',
        });
    }
  }

  /**
   * Apply metadata suggestion
   */
  private async applyMetadataSuggestion(change: {
    target: string;
    action: string;
    description: string;
  }): Promise<void> {
    if (!this.dbContext) return;

    // Find the table/column
    const [table] = await this.dbContext
      .select()
      .from(explorerTableMetadata)
      .where(eq(explorerTableMetadata.table_name, change.target))
      .limit(1);

    if (table) {
      // Update table description
      await this.dbContext
        .update(explorerTableMetadata)
        .set({
          description: change.description,
          updated_at: new Date(),
          updated_by: this.userContext.user_id,
        })
        .where(eq(explorerTableMetadata.table_metadata_id, table.table_metadata_id));

      log.info('Applied metadata suggestion to table', {
        operation: 'apply_metadata_suggestion',
        target: change.target,
        component: 'business-logic',
      });
    }
  }

  /**
   * Apply instruction suggestion
   */
  private async applyInstructionSuggestion(change: {
    target: string;
    action: string;
    description: string;
  }): Promise<void> {
    // This would create a new schema instruction
    // Implementation depends on schema instructions table structure
    log.info('Instruction suggestion would be applied', {
      operation: 'apply_instruction_suggestion',
      target: change.target,
      component: 'business-logic',
    });
  }

  /**
   * Apply relationship suggestion
   */
  private async applyRelationshipSuggestion(change: {
    target: string;
    action: string;
    description: string;
  }): Promise<void> {
    // This would create a new table relationship
    // Implementation depends on relationships table structure
    log.info('Relationship suggestion would be applied', {
      operation: 'apply_relationship_suggestion',
      target: change.target,
      component: 'business-logic',
    });
  }

  /**
   * Reject a suggestion
   */
  async rejectSuggestion(suggestionId: string, reason?: string): Promise<ImprovementSuggestion> {
    this.requirePermission('data-explorer:manage:all');

    if (!this.dbContext) throw new Error('Database context not initialized');

    const [updated] = await this.dbContext
      .update(explorerImprovementSuggestions)
      .set({
        status: 'rejected',
        applied_by: this.userContext.user_id,
      })
      .where(eq(explorerImprovementSuggestions.suggestion_id, suggestionId))
      .returning();

    if (!updated) {
      throw new Error(`Suggestion ${suggestionId} not found`);
    }

    log.info('Suggestion rejected', {
      operation: 'reject_suggestion',
      suggestionId,
      reason,
      component: 'business-logic',
    });

    return updated as ImprovementSuggestion;
  }

  /**
   * Get suggestion statistics
   */
  async getSuggestionStatistics(): Promise<{
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    autoApplied: number;
    byType: Record<string, number>;
  }> {
    this.requirePermission('data-explorer:manage:all');

    if (!this.dbContext) throw new Error('Database context not initialized');

    const [stats] = await this.dbContext
      .select({
        total: sql<number>`count(*)`,
        pending: sql<number>`count(*) filter (where status = 'pending')`,
        approved: sql<number>`count(*) filter (where status = 'approved')`,
        rejected: sql<number>`count(*) filter (where status = 'rejected')`,
        autoApplied: sql<number>`count(*) filter (where status = 'auto_applied')`,
      })
      .from(explorerImprovementSuggestions);

    // Get by type
    const byTypeResults = await this.dbContext
      .select({
        type: explorerImprovementSuggestions.suggestion_type,
        count: sql<number>`count(*)`,
      })
      .from(explorerImprovementSuggestions)
      .groupBy(explorerImprovementSuggestions.suggestion_type);

    const byType: Record<string, number> = {};
    for (const row of byTypeResults) {
      if (row.type) {
        byType[row.type] = Number(row.count);
      }
    }

    return {
      total: Number(stats?.total || 0),
      pending: Number(stats?.pending || 0),
      approved: Number(stats?.approved || 0),
      rejected: Number(stats?.rejected || 0),
      autoApplied: Number(stats?.autoApplied || 0),
      byType,
    };
  }
}

