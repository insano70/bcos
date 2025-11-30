import { and, desc, gte, isNull, sql } from 'drizzle-orm';
import { db, practice_attributes, practices, staff_members, templates } from '@/lib/db';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Practice Analytics Service
 * Provides analytics and reporting for practices
 * Separated from CRUD operations for Single Responsibility
 */

// =============================================================================
// Return Types
// =============================================================================

export interface PracticeAnalyticsOverview {
  overview: {
    totalPractices: number;
    activePractices: number;
    newPracticesThisPeriod: number;
    practicesWithDomains: number;
    activationRate: number;
    domainCompletionRate: number;
  };
}

export interface CreationTrendDataPoint {
  date: string;
  count: number;
}

export interface TemplateUsageEntry {
  templateId: string | null;
  templateName: string | null;
  templateSlug: string | null;
  count: number;
}

export interface StatusDistributionEntry {
  status: string | null;
  count: number;
}

export interface StaffStatistics {
  totalStaff: number;
  averageStaffPerPractice: number;
}

export interface PracticeWithStaffCount {
  practiceId: string;
  practiceName: string;
  domain: string | null;
  staffCount: number;
}

export interface RecentPractice {
  practiceId: string;
  name: string;
  domain: string | null;
  status: string | null;
  templateId: string | null;
  createdAt: Date | null;
}

export interface AttributesCompletion {
  totalWithAttributes: number;
  withBusinessHours: number;
  withServices: number;
  withInsurance: number;
  withConditions: number;
  withColors: number;
}

export interface PracticeAnalyticsServiceInterface {
  getPracticeAnalytics(timeframe?: string): Promise<PracticeAnalyticsOverview>;
  getCreationTrends(timeframe?: string): Promise<CreationTrendDataPoint[]>;
  getTemplateUsage(): Promise<TemplateUsageEntry[]>;
  getStatusDistribution(): Promise<StatusDistributionEntry[]>;
  getStaffStatistics(): Promise<StaffStatistics>;
  getPracticesWithMostStaff(limit?: number): Promise<PracticeWithStaffCount[]>;
  getRecentPractices(limit?: number): Promise<RecentPractice[]>;
  getAttributesCompletion(): Promise<AttributesCompletion>;
}

/**
 * Internal analytics service class
 */
class PracticeAnalyticsService implements PracticeAnalyticsServiceInterface {
  constructor(private userContext: UserContext) {}

  /**
   * Get practice analytics for admin dashboard
   */
  async getPracticeAnalytics(timeframe: string = '30d'): Promise<PracticeAnalyticsOverview> {
    const startTime = Date.now();

    try {
      const startDate = getStartDateFromTimeframe(timeframe);

      // Get practice statistics
      const [practiceStats] = await db
        .select({
          totalPractices: sql<number>`count(*)`,
          activePractices: sql<number>`count(case when status = 'active' then 1 end)`,
          newPracticesThisPeriod: sql<number>`count(case when created_at >= ${startDate} then 1 end)`,
          practicesWithDomains: sql<number>`count(case when domain is not null and domain != '' then 1 end)`,
        })
        .from(practices)
        .where(isNull(practices.deleted_at));

      const duration = Date.now() - startTime;

      log.info('practice analytics query completed', {
        operation: 'get_practice_analytics',
        userId: this.userContext.user_id,
        timeframe,
        results: {
          total: practiceStats?.totalPractices || 0,
          active: practiceStats?.activePractices || 0,
          new: practiceStats?.newPracticesThisPeriod || 0,
        },
        duration,
        slow: duration > SLOW_THRESHOLDS.DB_QUERY,
        component: 'analytics',
      });

      return {
        overview: {
          totalPractices: practiceStats?.totalPractices || 0,
          activePractices: practiceStats?.activePractices || 0,
          newPracticesThisPeriod: practiceStats?.newPracticesThisPeriod || 0,
          practicesWithDomains: practiceStats?.practicesWithDomains || 0,
          activationRate:
            (practiceStats?.totalPractices || 0) > 0
              ? Math.round(
                  ((practiceStats?.activePractices || 0) / (practiceStats?.totalPractices || 1)) *
                    100
                )
              : 0,
          domainCompletionRate:
            (practiceStats?.totalPractices || 0) > 0
              ? Math.round(
                  ((practiceStats?.practicesWithDomains || 0) /
                    (practiceStats?.totalPractices || 1)) *
                    100
                )
              : 0,
        },
      };
    } catch (error) {
      log.error('practice analytics query failed', error, {
        operation: 'get_practice_analytics',
        userId: this.userContext.user_id,
        timeframe,
        duration: Date.now() - startTime,
        component: 'analytics',
      });
      throw error;
    }
  }

  /**
   * Get practice creation trends
   */
  async getCreationTrends(timeframe: string = '30d'): Promise<CreationTrendDataPoint[]> {
    const startTime = Date.now();

    try {
      const startDate = getStartDateFromTimeframe(timeframe);

      const creationTrend = await db
        .select({
          date: sql<string>`date(created_at)`,
          count: sql<number>`count(*)`,
        })
        .from(practices)
        .where(and(isNull(practices.deleted_at), gte(practices.created_at, startDate)))
        .groupBy(sql`date(created_at)`)
        .orderBy(sql`date(created_at)`);

      const duration = Date.now() - startTime;

      log.info('practice creation trends query completed', {
        operation: 'get_creation_trends',
        userId: this.userContext.user_id,
        timeframe,
        dataPoints: creationTrend.length,
        duration,
        slow: duration > SLOW_THRESHOLDS.DB_QUERY,
        component: 'analytics',
      });

      return creationTrend;
    } catch (error) {
      log.error('practice creation trends query failed', error, {
        operation: 'get_creation_trends',
        userId: this.userContext.user_id,
        timeframe,
        duration: Date.now() - startTime,
        component: 'analytics',
      });
      throw error;
    }
  }

  /**
   * Get template usage statistics
   */
  async getTemplateUsage(): Promise<TemplateUsageEntry[]> {
    const startTime = Date.now();

    try {
      const templateUsage = await db
        .select({
          templateId: practices.template_id,
          templateName: templates.name,
          templateSlug: templates.slug,
          count: sql<number>`count(*)`,
        })
        .from(practices)
        .leftJoin(templates, sql`${practices.template_id} = ${templates.template_id}`)
        .where(isNull(practices.deleted_at))
        .groupBy(practices.template_id, templates.name, templates.slug)
        .orderBy(desc(sql`count(*)`));

      const duration = Date.now() - startTime;

      log.info('template usage query completed', {
        operation: 'get_template_usage',
        userId: this.userContext.user_id,
        templateCount: templateUsage.length,
        duration,
        slow: duration > SLOW_THRESHOLDS.DB_QUERY,
        component: 'analytics',
      });

      return templateUsage;
    } catch (error) {
      log.error('template usage query failed', error, {
        operation: 'get_template_usage',
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'analytics',
      });
      throw error;
    }
  }

  /**
   * Get practice status distribution
   */
  async getStatusDistribution(): Promise<StatusDistributionEntry[]> {
    const startTime = Date.now();

    try {
      const statusDistribution = await db
        .select({
          status: practices.status,
          count: sql<number>`count(*)`,
        })
        .from(practices)
        .where(isNull(practices.deleted_at))
        .groupBy(practices.status)
        .orderBy(desc(sql`count(*)`));

      const duration = Date.now() - startTime;

      log.info('status distribution query completed', {
        operation: 'get_status_distribution',
        userId: this.userContext.user_id,
        statusCount: statusDistribution.length,
        duration,
        slow: duration > SLOW_THRESHOLDS.DB_QUERY,
        component: 'analytics',
      });

      return statusDistribution;
    } catch (error) {
      log.error('status distribution query failed', error, {
        operation: 'get_status_distribution',
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'analytics',
      });
      throw error;
    }
  }

  /**
   * Get staff statistics
   */
  async getStaffStatistics(): Promise<StaffStatistics> {
    const startTime = Date.now();

    try {
      const [staffStats] = await db
        .select({
          totalStaff: sql<number>`count(*)`,
          averageStaffPerPractice: sql<number>`round(count(*)::decimal / nullif(count(distinct practice_id), 0), 2)`,
        })
        .from(staff_members)
        .where(isNull(staff_members.deleted_at));

      const duration = Date.now() - startTime;

      log.info('staff statistics query completed', {
        operation: 'get_staff_statistics',
        userId: this.userContext.user_id,
        totalStaff: staffStats?.totalStaff || 0,
        averagePerPractice: staffStats?.averageStaffPerPractice || 0,
        duration,
        slow: duration > SLOW_THRESHOLDS.DB_QUERY,
        component: 'analytics',
      });

      return (
        staffStats || {
          totalStaff: 0,
          averageStaffPerPractice: 0,
        }
      );
    } catch (error) {
      log.error('staff statistics query failed', error, {
        operation: 'get_staff_statistics',
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'analytics',
      });
      throw error;
    }
  }

  /**
   * Get practices with most staff
   */
  async getPracticesWithMostStaff(limit: number = 10): Promise<PracticeWithStaffCount[]> {
    const startTime = Date.now();

    try {
      const practicesWithMostStaff = await db
        .select({
          practiceId: practices.practice_id,
          practiceName: practices.name,
          domain: practices.domain,
          staffCount: sql<number>`count(${staff_members.staff_id})`,
        })
        .from(practices)
        .leftJoin(staff_members, sql`${practices.practice_id} = ${staff_members.practice_id}`)
        .where(and(isNull(practices.deleted_at), isNull(staff_members.deleted_at)))
        .groupBy(practices.practice_id, practices.name, practices.domain)
        .orderBy(desc(sql`count(${staff_members.staff_id})`))
        .limit(limit);

      const duration = Date.now() - startTime;

      log.info('practices with most staff query completed', {
        operation: 'get_practices_with_most_staff',
        userId: this.userContext.user_id,
        returned: practicesWithMostStaff.length,
        limit,
        duration,
        slow: duration > SLOW_THRESHOLDS.DB_QUERY,
        component: 'analytics',
      });

      return practicesWithMostStaff;
    } catch (error) {
      log.error('practices with most staff query failed', error, {
        operation: 'get_practices_with_most_staff',
        userId: this.userContext.user_id,
        limit,
        duration: Date.now() - startTime,
        component: 'analytics',
      });
      throw error;
    }
  }

  /**
   * Get recent practices
   */
  async getRecentPractices(limit: number = 10): Promise<RecentPractice[]> {
    const startTime = Date.now();

    try {
      const recentPractices = await db
        .select({
          practiceId: practices.practice_id,
          name: practices.name,
          domain: practices.domain,
          status: practices.status,
          templateId: practices.template_id,
          createdAt: practices.created_at,
        })
        .from(practices)
        .where(isNull(practices.deleted_at))
        .orderBy(desc(practices.created_at))
        .limit(limit);

      const duration = Date.now() - startTime;

      log.info('recent practices query completed', {
        operation: 'get_recent_practices',
        userId: this.userContext.user_id,
        returned: recentPractices.length,
        limit,
        duration,
        slow: duration > SLOW_THRESHOLDS.DB_QUERY,
        component: 'analytics',
      });

      return recentPractices;
    } catch (error) {
      log.error('recent practices query failed', error, {
        operation: 'get_recent_practices',
        userId: this.userContext.user_id,
        limit,
        duration: Date.now() - startTime,
        component: 'analytics',
      });
      throw error;
    }
  }

  /**
   * Get practice attributes completion stats
   */
  async getAttributesCompletion(): Promise<AttributesCompletion> {
    const startTime = Date.now();

    try {
      const [attributesCompletion] = await db
        .select({
          totalWithAttributes: sql<number>`count(*)`,
          withBusinessHours: sql<number>`count(case when business_hours is not null then 1 end)`,
          withServices: sql<number>`count(case when services is not null then 1 end)`,
          withInsurance: sql<number>`count(case when insurance_accepted is not null then 1 end)`,
          withConditions: sql<number>`count(case when conditions_treated is not null then 1 end)`,
          withColors: sql<number>`count(case when primary_color is not null then 1 end)`,
        })
        .from(practice_attributes);

      const duration = Date.now() - startTime;

      log.info('attributes completion query completed', {
        operation: 'get_attributes_completion',
        userId: this.userContext.user_id,
        totalWithAttributes: attributesCompletion?.totalWithAttributes || 0,
        duration,
        slow: duration > SLOW_THRESHOLDS.DB_QUERY,
        component: 'analytics',
      });

      return (
        attributesCompletion || {
          totalWithAttributes: 0,
          withBusinessHours: 0,
          withServices: 0,
          withInsurance: 0,
          withConditions: 0,
          withColors: 0,
        }
      );
    } catch (error) {
      log.error('attributes completion query failed', error, {
        operation: 'get_attributes_completion',
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'analytics',
      });
      throw error;
    }
  }
}

/**
 * Helper to get start date from timeframe string
 */
function getStartDateFromTimeframe(timeframe: string): Date {
  const now = new Date();

  switch (timeframe) {
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '90d':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case '1y':
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

/**
 * Create a practice analytics service instance
 */
export function createPracticeAnalyticsService(
  userContext: UserContext
): PracticeAnalyticsServiceInterface {
  return new PracticeAnalyticsService(userContext);
}
