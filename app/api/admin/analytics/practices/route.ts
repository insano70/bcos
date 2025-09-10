import { NextRequest } from 'next/server'
import { db, practices, practice_attributes, staff_members, templates } from '@/lib/db'
import { sql, eq, isNull, gte, and, desc, count } from 'drizzle-orm'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse } from '@/lib/api/responses/error'
import { applyRateLimit } from '@/lib/api/middleware/rate-limit'
import { requireAdmin } from '@/lib/api/middleware/auth'

/**
 * Admin Analytics - Practice Metrics
 * Provides comprehensive practice analytics for admin dashboard
 */
export async function GET(request: NextRequest) {
  try {
    await applyRateLimit(request, 'api')
    await requireAdmin(request)
    
    const { searchParams } = new URL(request.url)
    const timeframe = searchParams.get('timeframe') || '30d'
    const startDate = getStartDate(timeframe)
    
    // Get practice statistics
    const [practiceStats] = await db
      .select({
        totalPractices: sql<number>`count(*)`,
        activePractices: sql<number>`count(case when status = 'active' then 1 end)`,
        newPracticesThisPeriod: sql<number>`count(case when created_at >= ${startDate} then 1 end)`,
        practicesWithDomains: sql<number>`count(case when domain is not null and domain != '' then 1 end)`
      })
      .from(practices)
      .where(isNull(practices.deleted_at))

    // Get practice creation trend
    const creationTrend = await db
      .select({
        date: sql<string>`date(created_at)`,
        count: sql<number>`count(*)`
      })
      .from(practices)
      .where(
        and(
          isNull(practices.deleted_at),
          gte(practices.created_at, startDate)
        )
      )
      .groupBy(sql`date(created_at)`)
      .orderBy(sql`date(created_at)`)

    // Get template usage statistics
    const templateUsage = await db
      .select({
        templateId: practices.template_id,
        templateName: templates.name,
        templateSlug: templates.slug,
        count: sql<number>`count(*)`
      })
      .from(practices)
      .leftJoin(templates, eq(practices.template_id, templates.template_id))
      .where(isNull(practices.deleted_at))
      .groupBy(practices.template_id, templates.name, templates.slug)
      .orderBy(desc(sql`count(*)`))

    // Get practice status distribution
    const statusDistribution = await db
      .select({
        status: practices.status,
        count: sql<number>`count(*)`
      })
      .from(practices)
      .where(isNull(practices.deleted_at))
      .groupBy(practices.status)
      .orderBy(desc(sql`count(*)`))

    // Get staff statistics
    const [staffStats] = await db
      .select({
        totalStaff: sql<number>`count(*)`,
        averageStaffPerPractice: sql<number>`round(count(*)::decimal / nullif(count(distinct practice_id), 0), 2)`
      })
      .from(staff_members)
      .where(isNull(staff_members.deleted_at))

    // Get practices with most staff
    const practicesWithMostStaff = await db
      .select({
        practiceId: practices.practice_id,
        practiceName: practices.name,
        domain: practices.domain,
        staffCount: sql<number>`count(${staff_members.staff_member_id})`
      })
      .from(practices)
      .leftJoin(staff_members, eq(practices.practice_id, staff_members.practice_id))
      .where(
        and(
          isNull(practices.deleted_at),
          isNull(staff_members.deleted_at)
        )
      )
      .groupBy(practices.practice_id, practices.name, practices.domain)
      .orderBy(desc(sql`count(${staff_members.staff_member_id})`))
      .limit(10)

    // Get recent practices
    const recentPractices = await db
      .select({
        practiceId: practices.practice_id,
        name: practices.name,
        domain: practices.domain,
        status: practices.status,
        templateId: practices.template_id,
        createdAt: practices.created_at
      })
      .from(practices)
      .where(isNull(practices.deleted_at))
      .orderBy(desc(practices.created_at))
      .limit(10)

    // Get practice attributes completion stats
    const attributesCompletion = await db
      .select({
        totalWithAttributes: sql<number>`count(*)`,
        withBusinessHours: sql<number>`count(case when business_hours is not null then 1 end)`,
        withServices: sql<number>`count(case when services is not null then 1 end)`,
        withInsurance: sql<number>`count(case when insurance_accepted is not null then 1 end)`,
        withConditions: sql<number>`count(case when conditions_treated is not null then 1 end)`,
        withColors: sql<number>`count(case when primary_color is not null then 1 end)`
      })
      .from(practice_attributes)

    const analytics = {
      overview: {
        totalPractices: practiceStats.totalPractices,
        activePractices: practiceStats.activePractices,
        newPracticesThisPeriod: practiceStats.newPracticesThisPeriod,
        practicesWithDomains: practiceStats.practicesWithDomains,
        activationRate: practiceStats.totalPractices > 0 
          ? Math.round((practiceStats.activePractices / practiceStats.totalPractices) * 100) 
          : 0,
        domainCompletionRate: practiceStats.totalPractices > 0 
          ? Math.round((practiceStats.practicesWithDomains / practiceStats.totalPractices) * 100) 
          : 0
      },
      trends: {
        creations: creationTrend
      },
      templates: {
        usage: templateUsage,
        mostPopular: templateUsage[0] || null
      },
      status: {
        distribution: statusDistribution
      },
      staff: {
        totalStaff: staffStats.totalStaff || 0,
        averagePerPractice: staffStats.averageStaffPerPractice || 0,
        topPractices: practicesWithMostStaff
      },
      completion: {
        attributes: attributesCompletion[0] || {
          totalWithAttributes: 0,
          withBusinessHours: 0,
          withServices: 0,
          withInsurance: 0,
          withConditions: 0,
          withColors: 0
        }
      },
      recent: {
        practices: recentPractices
      },
      metadata: {
        timeframe,
        startDate: startDate.toISOString(),
        generatedAt: new Date().toISOString()
      }
    }

    return createSuccessResponse(analytics, 'Practice analytics retrieved successfully')
    
  } catch (error) {
    console.error('Practice analytics error:', error)
    return createErrorResponse(error, 500, request)
  }
}

function getStartDate(timeframe: string): Date {
  const now = new Date()
  
  switch (timeframe) {
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    case '90d':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    case '1y':
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  }
}
