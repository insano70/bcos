/**
 * Feedback Analytics Service
 * Provides comprehensive analytics on feedback trends, patterns, and impact
 */

import { BaseRBACService } from '@/lib/rbac/base-service';
import { db } from '@/lib/db';
import { explorerQueryFeedback, explorerQueryHistory, explorerImprovementSuggestions } from '@/lib/db/schema';
import type { UserContext } from '@/lib/types/rbac';
import { sql, and, gte, lte, desc } from 'drizzle-orm';
import { log } from '@/lib/logger';

export interface FeedbackAnalytics {
  overview: FeedbackOverview;
  trends: FeedbackTrends;
  topIssues: TopIssue[];
  resolutionMetrics: ResolutionMetrics;
  impactMetrics: ImpactMetrics;
  timeSeriesData: TimeSeriesData[];
}

export interface FeedbackOverview {
  totalFeedback: number;
  pendingFeedback: number;
  resolvedFeedback: number;
  criticalIssues: number;
  averageResolutionTime: number; // hours
  resolutionRate: number; // percentage
}

export interface FeedbackTrends {
  feedbackByType: Record<string, number>;
  feedbackByCategory: Record<string, number>;
  feedbackBySeverity: Record<string, number>;
  weekOverWeekChange: number; // percentage
  monthOverMonthChange: number; // percentage
}

export interface TopIssue {
  issue: string;
  count: number;
  severity: string;
  affectedTables: string[];
  firstSeen: Date;
  lastSeen: Date;
  resolved: number;
  pending: number;
}

export interface ResolutionMetrics {
  averageTimeToResolve: number; // hours
  resolutionsByStatus: Record<string, number>;
  resolutionsByType: Record<string, number>;
  fastestResolutions: Array<{ feedbackId: string; hours: number }>;
  slowestResolutions: Array<{ feedbackId: string; hours: number }>;
}

export interface ImpactMetrics {
  queriesImproved: number;
  metadataUpdates: number;
  instructionsCreated: number;
  relationshipsAdded: number;
  editRateReduction: number; // percentage
  userSatisfactionImprovement: number; // percentage
}

export interface TimeSeriesData {
  date: string;
  feedbackCount: number;
  resolvedCount: number;
  criticalCount: number;
  editRate: number;
}

export class FeedbackAnalyticsService extends BaseRBACService {
  constructor(userContext: UserContext) {
    super(userContext, db);
  }

  /**
   * Get comprehensive feedback analytics
   */
  async getAnalytics(dateRange?: { start: Date; end: Date }): Promise<FeedbackAnalytics> {
    const startTime = Date.now();

    this.requirePermission('data-explorer:manage:all');

    if (!this.dbContext) throw new Error('Database context not initialized');

    const [overview, trends, topIssues, resolutionMetrics, impactMetrics, timeSeriesData] =
      await Promise.all([
        this.getOverview(dateRange),
        this.getTrends(dateRange),
        this.getTopIssues(dateRange),
        this.getResolutionMetrics(dateRange),
        this.getImpactMetrics(dateRange),
        this.getTimeSeriesData(dateRange),
      ]);

    const duration = Date.now() - startTime;

    log.info('Feedback analytics generated', {
      operation: 'get_feedback_analytics',
      dateRange: dateRange ? `${dateRange.start} to ${dateRange.end}` : 'all time',
      duration,
      component: 'business-logic',
    });

    return {
      overview,
      trends,
      topIssues,
      resolutionMetrics,
      impactMetrics,
      timeSeriesData,
    };
  }

  /**
   * Get overview metrics
   */
  private async getOverview(dateRange?: { start: Date; end: Date }): Promise<FeedbackOverview> {
    if (!this.dbContext) throw new Error('Database context not initialized');

    const conditions = [];
    if (dateRange) {
      conditions.push(
        and(
          gte(explorerQueryFeedback.created_at, dateRange.start),
          lte(explorerQueryFeedback.created_at, dateRange.end)
        )
      );
    }

    const [stats] = await this.dbContext
      .select({
        totalFeedback: sql<number>`count(*)`,
        pendingFeedback: sql<number>`count(*) filter (where resolution_status = 'pending')`,
        resolvedFeedback: sql<number>`count(*) filter (where resolution_status != 'pending')`,
        criticalIssues: sql<number>`count(*) filter (where severity = 'critical' and resolution_status = 'pending')`,
        avgResolutionHours: sql<number>`
          round(avg(
            extract(epoch from (resolved_at - created_at)) / 3600
          ) filter (where resolved_at is not null), 2)
        `,
      })
      .from(explorerQueryFeedback)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = Number(stats?.totalFeedback || 0);
    const resolved = Number(stats?.resolvedFeedback || 0);

    return {
      totalFeedback: total,
      pendingFeedback: Number(stats?.pendingFeedback || 0),
      resolvedFeedback: resolved,
      criticalIssues: Number(stats?.criticalIssues || 0),
      averageResolutionTime: Number(stats?.avgResolutionHours || 0),
      resolutionRate: total > 0 ? (resolved / total) * 100 : 0,
    };
  }

  /**
   * Get trend data
   */
  private async getTrends(dateRange?: { start: Date; end: Date }): Promise<FeedbackTrends> {
    if (!this.dbContext) throw new Error('Database context not initialized');

    const conditions = [];
    if (dateRange) {
      conditions.push(
        and(
          gte(explorerQueryFeedback.created_at, dateRange.start),
          lte(explorerQueryFeedback.created_at, dateRange.end)
        )
      );
    }

    // Get feedback by type
    const byType = await this.dbContext
      .select({
        type: explorerQueryFeedback.feedback_type,
        count: sql<number>`count(*)`,
      })
      .from(explorerQueryFeedback)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(explorerQueryFeedback.feedback_type);

    // Get feedback by category
    const byCategory = await this.dbContext
      .select({
        category: explorerQueryFeedback.feedback_category,
        count: sql<number>`count(*)`,
      })
      .from(explorerQueryFeedback)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(explorerQueryFeedback.feedback_category);

    // Get feedback by severity
    const bySeverity = await this.dbContext
      .select({
        severity: explorerQueryFeedback.severity,
        count: sql<number>`count(*)`,
      })
      .from(explorerQueryFeedback)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(explorerQueryFeedback.severity);

    // Calculate week-over-week and month-over-month changes
    const now = new Date();
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [thisWeek] = await this.dbContext
      .select({ count: sql<number>`count(*)` })
      .from(explorerQueryFeedback)
      .where(gte(explorerQueryFeedback.created_at, lastWeek));

    const [previousWeek] = await this.dbContext
      .select({ count: sql<number>`count(*)` })
      .from(explorerQueryFeedback)
      .where(
        and(
          gte(explorerQueryFeedback.created_at, twoWeeksAgo),
          lte(explorerQueryFeedback.created_at, lastWeek)
        )
      );

    const thisWeekCount = Number(thisWeek?.count || 0);
    const prevWeekCount = Number(previousWeek?.count || 0);
    const weekOverWeekChange =
      prevWeekCount > 0 ? ((thisWeekCount - prevWeekCount) / prevWeekCount) * 100 : 0;

    return {
      feedbackByType: Object.fromEntries(
        byType.map((r) => [r.type || 'unknown', Number(r.count)])
      ),
      feedbackByCategory: Object.fromEntries(
        byCategory.map((r) => [r.category || 'unknown', Number(r.count)])
      ),
      feedbackBySeverity: Object.fromEntries(
        bySeverity.map((r) => [r.severity || 'unknown', Number(r.count)])
      ),
      weekOverWeekChange,
      monthOverMonthChange: 0, // Simplified for now
    };
  }

  /**
   * Get top issues
   */
  private async getTopIssues(dateRange?: { start: Date; end: Date }): Promise<TopIssue[]> {
    if (!this.dbContext) throw new Error('Database context not initialized');

    const conditions = [];
    if (dateRange) {
      conditions.push(
        and(
          gte(explorerQueryFeedback.created_at, dateRange.start),
          lte(explorerQueryFeedback.created_at, dateRange.end)
        )
      );
    }

    const issues = await this.dbContext
      .select({
        issue: explorerQueryFeedback.detected_issue,
        count: sql<number>`count(*)`,
        severity: explorerQueryFeedback.severity,
        affectedTables: explorerQueryFeedback.affected_tables,
        firstSeen: sql<Date>`min(created_at)`,
        lastSeen: sql<Date>`max(created_at)`,
        resolved: sql<number>`count(*) filter (where resolution_status != 'pending')`,
        pending: sql<number>`count(*) filter (where resolution_status = 'pending')`,
      })
      .from(explorerQueryFeedback)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(explorerQueryFeedback.detected_issue, explorerQueryFeedback.severity, explorerQueryFeedback.affected_tables)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    return issues.map((issue) => ({
      issue: issue.issue || 'Unknown issue',
      count: Number(issue.count),
      severity: issue.severity || 'medium',
      affectedTables: issue.affectedTables || [],
      firstSeen: issue.firstSeen,
      lastSeen: issue.lastSeen,
      resolved: Number(issue.resolved),
      pending: Number(issue.pending),
    }));
  }

  /**
   * Get resolution metrics
   */
  private async getResolutionMetrics(
    dateRange?: { start: Date; end: Date }
  ): Promise<ResolutionMetrics> {
    if (!this.dbContext) throw new Error('Database context not initialized');

    const conditions = [];
    if (dateRange) {
      conditions.push(
        and(
          gte(explorerQueryFeedback.created_at, dateRange.start),
          lte(explorerQueryFeedback.created_at, dateRange.end)
        )
      );
    }

    // Average time to resolve
    const [avgTime] = await this.dbContext
      .select({
        avgHours: sql<number>`
          round(avg(
            extract(epoch from (resolved_at - created_at)) / 3600
          ) filter (where resolved_at is not null), 2)
        `,
      })
      .from(explorerQueryFeedback)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    // Resolutions by status
    const byStatus = await this.dbContext
      .select({
        status: explorerQueryFeedback.resolution_status,
        count: sql<number>`count(*)`,
      })
      .from(explorerQueryFeedback)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(explorerQueryFeedback.resolution_status);

    // Fastest resolutions
    const fastest = await this.dbContext
      .select({
        feedbackId: explorerQueryFeedback.feedback_id,
        hours: sql<number>`extract(epoch from (resolved_at - created_at)) / 3600`,
      })
      .from(explorerQueryFeedback)
      .where(
        and(
          sql`resolved_at is not null`,
          conditions.length > 0 ? and(...conditions) : undefined
        )
      )
      .orderBy(sql`extract(epoch from (resolved_at - created_at))`)
      .limit(5);

    // Slowest resolutions
    const slowest = await this.dbContext
      .select({
        feedbackId: explorerQueryFeedback.feedback_id,
        hours: sql<number>`extract(epoch from (resolved_at - created_at)) / 3600`,
      })
      .from(explorerQueryFeedback)
      .where(
        and(
          sql`resolved_at is not null`,
          conditions.length > 0 ? and(...conditions) : undefined
        )
      )
      .orderBy(desc(sql`extract(epoch from (resolved_at - created_at))`))
      .limit(5);

    return {
      averageTimeToResolve: Number(avgTime?.avgHours || 0),
      resolutionsByStatus: Object.fromEntries(
        byStatus.map((r) => [r.status || 'unknown', Number(r.count)])
      ),
      resolutionsByType: {}, // Simplified
      fastestResolutions: fastest.map((r) => ({
        feedbackId: r.feedbackId,
        hours: Number(r.hours),
      })),
      slowestResolutions: slowest.map((r) => ({
        feedbackId: r.feedbackId,
        hours: Number(r.hours),
      })),
    };
  }

  /**
   * Get impact metrics
   */
  private async getImpactMetrics(_dateRange?: { start: Date; end: Date }): Promise<ImpactMetrics> {
    if (!this.dbContext) throw new Error('Database context not initialized');

    // Get suggestion statistics
    const [suggestionStats] = await this.dbContext
      .select({
        metadataUpdates: sql<number>`count(*) filter (where suggestion_type = 'add_metadata' and status = 'approved')`,
        instructionsCreated: sql<number>`count(*) filter (where suggestion_type = 'add_instruction' and status = 'approved')`,
        relationshipsAdded: sql<number>`count(*) filter (where suggestion_type = 'add_relationship' and status = 'approved')`,
      })
      .from(explorerImprovementSuggestions);

    // Calculate edit rate reduction
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const [recentEditRate] = await this.dbContext
      .select({
        editRate: sql<number>`
          round((count(*) filter (where was_sql_edited = true)::numeric / count(*)::numeric * 100), 2)
        `,
      })
      .from(explorerQueryHistory)
      .where(gte(explorerQueryHistory.created_at, thirtyDaysAgo));

    const [previousEditRate] = await this.dbContext
      .select({
        editRate: sql<number>`
          round((count(*) filter (where was_sql_edited = true)::numeric / count(*)::numeric * 100), 2)
        `,
      })
      .from(explorerQueryHistory)
      .where(
        and(
          gte(explorerQueryHistory.created_at, sixtyDaysAgo),
          lte(explorerQueryHistory.created_at, thirtyDaysAgo)
        )
      );

    const recentRate = Number(recentEditRate?.editRate || 0);
    const previousRate = Number(previousEditRate?.editRate || 0);
    const editRateReduction = previousRate > 0 ? ((previousRate - recentRate) / previousRate) * 100 : 0;

    return {
      queriesImproved: 0, // Would need to track this separately
      metadataUpdates: Number(suggestionStats?.metadataUpdates || 0),
      instructionsCreated: Number(suggestionStats?.instructionsCreated || 0),
      relationshipsAdded: Number(suggestionStats?.relationshipsAdded || 0),
      editRateReduction,
      userSatisfactionImprovement: 0, // Would need user rating tracking
    };
  }

  /**
   * Get time series data for charts
   */
  private async getTimeSeriesData(
    dateRange?: { start: Date; end: Date }
  ): Promise<TimeSeriesData[]> {
    if (!this.dbContext) throw new Error('Database context not initialized');

    const start = dateRange?.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = dateRange?.end || new Date();

    const data = await this.dbContext
      .select({
        date: sql<string>`date(created_at)`,
        feedbackCount: sql<number>`count(*)`,
        resolvedCount: sql<number>`count(*) filter (where resolution_status != 'pending')`,
        criticalCount: sql<number>`count(*) filter (where severity = 'critical')`,
      })
      .from(explorerQueryFeedback)
      .where(and(gte(explorerQueryFeedback.created_at, start), lte(explorerQueryFeedback.created_at, end)))
      .groupBy(sql`date(created_at)`)
      .orderBy(sql`date(created_at)`);

    return data.map((row) => ({
      date: row.date,
      feedbackCount: Number(row.feedbackCount),
      resolvedCount: Number(row.resolvedCount),
      criticalCount: Number(row.criticalCount),
      editRate: 0, // Would need to join with query history
    }));
  }

  /**
   * Get learning loop metrics
   */
  async getLearningMetrics(): Promise<{
    totalQueries: number;
    editedQueries: number;
    editRate: number;
    editRateTrend: Array<{ period: string; rate: number }>;
    feedbackVolumeTrend: Array<{ period: string; count: number }>;
    improvementScore: number;
  }> {
    this.requirePermission('data-explorer:manage:all');

    if (!this.dbContext) throw new Error('Database context not initialized');

    // Overall edit statistics
    const [editStats] = await this.dbContext
      .select({
        totalQueries: sql<number>`count(*)`,
        editedQueries: sql<number>`count(*) filter (where was_sql_edited = true)`,
        editRate: sql<number>`round((count(*) filter (where was_sql_edited = true)::numeric / count(*)::numeric * 100), 2)`,
      })
      .from(explorerQueryHistory);

    // Edit rate trend (last 12 weeks)
    const editRateTrend = await this.dbContext
      .select({
        week: sql<string>`to_char(date_trunc('week', created_at), 'YYYY-MM-DD')`,
        rate: sql<number>`round((count(*) filter (where was_sql_edited = true)::numeric / count(*)::numeric * 100), 2)`,
      })
      .from(explorerQueryHistory)
      .where(gte(explorerQueryHistory.created_at, new Date(Date.now() - 84 * 24 * 60 * 60 * 1000)))
      .groupBy(sql`date_trunc('week', created_at)`)
      .orderBy(sql`date_trunc('week', created_at)`);

    // Feedback volume trend
    const feedbackTrend = await this.dbContext
      .select({
        week: sql<string>`to_char(date_trunc('week', created_at), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)`,
      })
      .from(explorerQueryFeedback)
      .where(gte(explorerQueryFeedback.created_at, new Date(Date.now() - 84 * 24 * 60 * 60 * 1000)))
      .groupBy(sql`date_trunc('week', created_at)`)
      .orderBy(sql`date_trunc('week', created_at)`);

    // Calculate improvement score (0-100)
    const currentEditRate = Number(editStats?.editRate || 0);
    const improvementScore = Math.max(0, Math.min(100, 100 - currentEditRate * 2));

    return {
      totalQueries: Number(editStats?.totalQueries || 0),
      editedQueries: Number(editStats?.editedQueries || 0),
      editRate: currentEditRate,
      editRateTrend: editRateTrend.map((r) => ({
        period: r.week,
        rate: Number(r.rate),
      })),
      feedbackVolumeTrend: feedbackTrend.map((r) => ({
        period: r.week,
        count: Number(r.count),
      })),
      improvementScore,
    };
  }
}

