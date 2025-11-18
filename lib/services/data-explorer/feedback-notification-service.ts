/**
 * Feedback Notification Service
 * Alerts admins of critical issues and high-frequency problems
 */

import { BaseRBACService } from '@/lib/rbac/base-service';
import { db } from '@/lib/db';
import { explorerQueryFeedback } from '@/lib/db/schema';
import type { UserContext } from '@/lib/types/rbac';
import { sql, and, gte, eq } from 'drizzle-orm';
import { log } from '@/lib/logger';

export interface FeedbackAlert {
  type: 'critical_issue' | 'high_frequency' | 'unresolved_spike' | 'pattern_detected';
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  feedbackIds: string[];
  affectedTables: string[];
  count: number;
  createdAt: Date;
}

export class FeedbackNotificationService extends BaseRBACService {
  constructor(userContext: UserContext) {
    super(userContext, db);
  }

  /**
   * Check for critical issues and generate alerts
   */
  async checkForAlerts(): Promise<FeedbackAlert[]> {
    const startTime = Date.now();

    this.requirePermission('data-explorer:manage:all');

    if (!this.dbContext) throw new Error('Database context not initialized');

    const alerts: FeedbackAlert[] = [];

    // Check for critical unresolved issues
    const criticalAlerts = await this.checkCriticalIssues();
    alerts.push(...criticalAlerts);

    // Check for high-frequency issues
    const frequencyAlerts = await this.checkHighFrequencyIssues();
    alerts.push(...frequencyAlerts);

    // Check for unresolved spike
    const spikeAlerts = await this.checkUnresolvedSpike();
    alerts.push(...spikeAlerts);

    const duration = Date.now() - startTime;

    log.info('Feedback alerts checked', {
      operation: 'check_feedback_alerts',
      alertCount: alerts.length,
      duration,
      component: 'business-logic',
    });

    return alerts;
  }

  /**
   * Check for critical unresolved issues
   */
  private async checkCriticalIssues(): Promise<FeedbackAlert[]> {
    if (!this.dbContext) return [];

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const criticalIssues = await this.dbContext
      .select({
        feedbackId: explorerQueryFeedback.feedback_id,
        detectedIssue: explorerQueryFeedback.detected_issue,
        affectedTables: explorerQueryFeedback.affected_tables,
        createdAt: explorerQueryFeedback.created_at,
      })
      .from(explorerQueryFeedback)
      .where(
        and(
          eq(explorerQueryFeedback.severity, 'critical'),
          eq(explorerQueryFeedback.resolution_status, 'pending'),
          gte(explorerQueryFeedback.created_at, twentyFourHoursAgo)
        )
      );

    if (criticalIssues.length === 0) return [];

    return [
      {
        type: 'critical_issue',
        severity: 'high',
        title: `${criticalIssues.length} Critical Issue${criticalIssues.length > 1 ? 's' : ''} Unresolved`,
        description: `There are ${criticalIssues.length} critical feedback items that have been pending for over 24 hours`,
        feedbackIds: criticalIssues.map((i) => i.feedbackId),
        affectedTables: Array.from(
          new Set(criticalIssues.flatMap((i) => i.affectedTables || []))
        ),
        count: criticalIssues.length,
        createdAt: new Date(),
      },
    ];
  }

  /**
   * Check for high-frequency issues
   */
  private async checkHighFrequencyIssues(): Promise<FeedbackAlert[]> {
    if (!this.dbContext) return [];

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const frequentIssues = await this.dbContext
      .select({
        detectedIssue: explorerQueryFeedback.detected_issue,
        count: sql<number>`count(*)`,
        feedbackIds: sql<string[]>`array_agg(feedback_id)`,
        affectedTables: sql<string[]>`array_agg(distinct affected_tables)`,
      })
      .from(explorerQueryFeedback)
      .where(gte(explorerQueryFeedback.created_at, sevenDaysAgo))
      .groupBy(explorerQueryFeedback.detected_issue)
      .having(sql`count(*) >= 5`);

    return frequentIssues.map((issue) => ({
      type: 'high_frequency' as const,
      severity: Number(issue.count) >= 10 ? ('high' as const) : ('medium' as const),
      title: `High-Frequency Issue: ${issue.detectedIssue || 'Unknown'}`,
      description: `This issue has occurred ${issue.count} times in the last 7 days`,
      feedbackIds: issue.feedbackIds || [],
      affectedTables: issue.affectedTables?.flat().filter((t): t is string => t !== null) || [],
      count: Number(issue.count),
      createdAt: new Date(),
    }));
  }

  /**
   * Check for spike in unresolved feedback
   */
  private async checkUnresolvedSpike(): Promise<FeedbackAlert[]> {
    if (!this.dbContext) return [];

    const [unresolvedCount] = await this.dbContext
      .select({
        count: sql<number>`count(*)`,
      })
      .from(explorerQueryFeedback)
      .where(eq(explorerQueryFeedback.resolution_status, 'pending'));

    const count = Number(unresolvedCount?.count || 0);

    // Alert if more than 20 unresolved items
    if (count > 20) {
      return [
        {
          type: 'unresolved_spike',
          severity: count > 50 ? 'high' : 'medium',
          title: `${count} Unresolved Feedback Items`,
          description: `There are currently ${count} unresolved feedback items requiring attention`,
          feedbackIds: [],
          affectedTables: [],
          count,
          createdAt: new Date(),
        },
      ];
    }

    return [];
  }

  /**
   * Send alert notification (placeholder for email/webhook integration)
   */
  async sendAlert(alert: FeedbackAlert): Promise<void> {
    this.requirePermission('data-explorer:manage:all');

    // Log the alert
    log.warn('Feedback alert generated', {
      operation: 'send_feedback_alert',
      alertType: alert.type,
      severity: alert.severity,
      title: alert.title,
      count: alert.count,
      component: 'business-logic',
    });

    // In a real implementation, this would:
    // 1. Send email to admins
    // 2. Post to Slack/Teams webhook
    // 3. Create in-app notification
    // 4. Log to monitoring system

    // For now, just log it
    log.info('Alert notification sent', {
      operation: 'send_alert_notification',
      alertType: alert.type,
      component: 'business-logic',
    });
  }

  /**
   * Get daily digest of feedback activity
   */
  async getDailyDigest(): Promise<{
    newFeedback: number;
    resolvedFeedback: number;
    criticalIssues: number;
    topIssues: Array<{ issue: string; count: number }>;
    alerts: FeedbackAlert[];
  }> {
    this.requirePermission('data-explorer:manage:all');

    if (!this.dbContext) throw new Error('Database context not initialized');

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Get new feedback count
    const [newFeedback] = await this.dbContext
      .select({ count: sql<number>`count(*)` })
      .from(explorerQueryFeedback)
      .where(gte(explorerQueryFeedback.created_at, twentyFourHoursAgo));

    // Get resolved feedback count
    const [resolvedFeedback] = await this.dbContext
      .select({ count: sql<number>`count(*)` })
      .from(explorerQueryFeedback)
      .where(
        and(
          gte(explorerQueryFeedback.resolved_at, twentyFourHoursAgo),
          sql`resolved_at is not null`
        )
      );

    // Get critical issues count
    const [criticalIssues] = await this.dbContext
      .select({ count: sql<number>`count(*)` })
      .from(explorerQueryFeedback)
      .where(
        and(
          eq(explorerQueryFeedback.severity, 'critical'),
          eq(explorerQueryFeedback.resolution_status, 'pending')
        )
      );

    // Get top issues
    const topIssues = await this.dbContext
      .select({
        issue: explorerQueryFeedback.detected_issue,
        count: sql<number>`count(*)`,
      })
      .from(explorerQueryFeedback)
      .where(gte(explorerQueryFeedback.created_at, twentyFourHoursAgo))
      .groupBy(explorerQueryFeedback.detected_issue)
      .orderBy(sql`count(*) desc`)
      .limit(5);

    // Get current alerts
    const alerts = await this.checkForAlerts();

    return {
      newFeedback: Number(newFeedback?.count || 0),
      resolvedFeedback: Number(resolvedFeedback?.count || 0),
      criticalIssues: Number(criticalIssues?.count || 0),
      topIssues: topIssues.map((i) => ({
        issue: i.issue || 'Unknown',
        count: Number(i.count),
      })),
      alerts,
    };
  }
}


