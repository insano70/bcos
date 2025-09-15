import { NextRequest } from 'next/server'
import { db, users, practices, practice_attributes, staff_members, templates } from '@/lib/db'
import { sql, eq, isNull, like, or, and, desc, asc } from 'drizzle-orm'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse } from '@/lib/api/responses/error'
import { validateQuery } from '@/lib/api/middleware/validation'
import { getPagination } from '@/lib/api/utils/request'
import { rbacRoute } from '@/lib/api/rbac-route-handler'
import { logger } from '@/lib/logger'
import type { UserContext } from '@/lib/types/rbac'
import { z } from 'zod'

/**
 * Universal Search API
 * Provides advanced search across users, practices, staff, and content
 */

const searchQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required'),
  type: z.enum(['all', 'users', 'practices', 'staff', 'templates']).optional().default('all'),
  status: z.enum(['active', 'inactive', 'all']).optional().default('all'),
  sort: z.enum(['relevance', 'name', 'created_at', 'updated_at']).optional().default('relevance'),
  order: z.enum(['asc', 'desc']).optional().default('desc')
})

const searchHandler = async (request: NextRequest, userContext: UserContext) => {
  try {
    
    const { searchParams } = new URL(request.url)
    const pagination = getPagination(searchParams)
    const query = validateQuery(searchParams, searchQuerySchema)
    
    // ✅ SECURITY: Sanitize search term to prevent SQL injection
    const sanitizedQuery = query.q
      .trim()
      .replace(/[%_\\]/g, '\\$&') // Escape SQL wildcards
      .replace(/[<>"']/g, '') // Remove dangerous characters
      .slice(0, 255); // Limit length
    const searchTerm = `%${sanitizedQuery.toLowerCase()}%`
    const results: any = {
      users: [],
      practices: [],
      staff: [],
      templates: [],
      total: 0,
      query: query.q,
      type: query.type,
      pagination
    }

    // RBAC: Apply permission-based filtering to search results
    const canReadUsers = userContext.is_super_admin || userContext.all_permissions.some(p =>
      p.name === 'users:read:own' || p.name === 'users:read:organization' || p.name === 'users:read:all'
    )
    const canReadPractices = userContext.is_super_admin || userContext.all_permissions.some(p =>
      p.name === 'practices:read:own' || p.name === 'practices:read:all'
    )
    const canReadAllData = userContext.is_super_admin
    
    // Search Users (with RBAC permission check)
    if ((query.type === 'all' || query.type === 'users') && canReadUsers) {
      const userConditions = [
        isNull(users.deleted_at),
        or(
          like(sql`lower(${users.first_name})`, searchTerm),
          like(sql`lower(${users.last_name})`, searchTerm),
          like(sql`lower(${users.email})`, searchTerm),
          like(sql`lower(concat(${users.first_name}, ' ', ${users.last_name}))`, searchTerm)
        )
      ]

      if (query.status !== 'all') {
        userConditions.push(eq(users.is_active, query.status === 'active'))
      }
      
      const userResults = await db
        .select({
          id: users.user_id,
          type: sql<string>`'user'`,
          title: sql<string>`concat(${users.first_name}, ' ', ${users.last_name})`,
          subtitle: users.email,
          status: sql<string>`case when ${users.is_active} then 'active' else 'inactive' end`,
          verified: users.email_verified,
          createdAt: users.created_at,
          updatedAt: users.updated_at,
          relevanceScore: calculateRelevanceScore(users.first_name, users.last_name, users.email, query.q)
        })
        .from(users)
        .where(and(...userConditions))
        .orderBy(getOrderBy(query.sort, query.order, 'user'))
        .limit(query.type === 'users' ? pagination.limit : 10)
        .offset(query.type === 'users' ? pagination.offset : 0)
      
      results.users = userResults
    }
    
    // Search Practices (with RBAC permission check)
    if ((query.type === 'all' || query.type === 'practices') && canReadPractices) {
      const practiceConditions = [
        isNull(practices.deleted_at),
        or(
          like(sql`lower(${practices.name})`, searchTerm),
          like(sql`lower(${practices.domain})`, searchTerm)
        )
      ]

      if (query.status !== 'all') {
        practiceConditions.push(eq(practices.status, query.status))
      }
      
      const practiceResults = await db
        .select({
          id: practices.practice_id,
          type: sql<string>`'practice'`,
          title: practices.name,
          subtitle: practices.domain,
          status: practices.status,
          templateId: practices.template_id,
          createdAt: practices.created_at,
          updatedAt: practices.updated_at,
          relevanceScore: calculateRelevanceScore(practices.name, practices.domain, sql`''`, query.q)
        })
        .from(practices)
        .where(and(...practiceConditions))
        .orderBy(getOrderBy(query.sort, query.order, 'practice'))
        .limit(query.type === 'practices' ? pagination.limit : 10)
        .offset(query.type === 'practices' ? pagination.offset : 0)
      
      results.practices = practiceResults
    }
    
    // Search Staff Members (with RBAC permission check)
    if ((query.type === 'all' || query.type === 'staff') && canReadPractices) {
      const staffConditions = [
        isNull(staff_members.deleted_at),
        or(
          like(sql`lower(${staff_members.name})`, searchTerm),
          like(sql`lower(${staff_members.title})`, searchTerm),
          like(sql`lower(${staff_members.specialties})`, searchTerm),
          like(sql`lower(${staff_members.bio})`, searchTerm)
        )
      ]
      
      const staffResults = await db
        .select({
          id: staff_members.staff_id,
          type: sql<string>`'staff'`,
          title: staff_members.name,
          subtitle: staff_members.title,
          practiceId: staff_members.practice_id,
          specialties: staff_members.specialties,
          createdAt: staff_members.created_at,
          updatedAt: staff_members.updated_at,
          relevanceScore: calculateRelevanceScore(staff_members.name, staff_members.title, staff_members.bio, query.q)
        })
        .from(staff_members)
        .where(and(...staffConditions))
        .orderBy(getOrderBy(query.sort, query.order, 'staff'))
        .limit(query.type === 'staff' ? pagination.limit : 10)
        .offset(query.type === 'staff' ? pagination.offset : 0)
      
      results.staff = staffResults
    }
    
    // Search Templates (with RBAC permission check)
    if ((query.type === 'all' || query.type === 'templates') && (canReadUsers || canReadPractices)) {
      const templateConditions = [
        isNull(templates.deleted_at),
        or(
          like(sql`lower(${templates.name})`, searchTerm),
          like(sql`lower(${templates.slug})`, searchTerm),
          like(sql`lower(${templates.description})`, searchTerm)
        )
      ]
      
      if (query.status !== 'all') {
        templateConditions.push(eq(templates.is_active, query.status === 'active'))
      }
      
      const templateResults = await db
        .select({
          id: templates.template_id,
          type: sql<string>`'template'`,
          title: templates.name,
          subtitle: templates.description,
          slug: templates.slug,
          status: sql<string>`case when ${templates.is_active} then 'active' else 'inactive' end`,
          previewImage: templates.preview_image_url,
          createdAt: templates.created_at,
          updatedAt: templates.updated_at,
          relevanceScore: calculateRelevanceScore(templates.name, templates.description, sql`''`, query.q)
        })
        .from(templates)
        .where(and(...templateConditions))
        .orderBy(getOrderBy(query.sort, query.order, 'template'))
        .limit(query.type === 'templates' ? pagination.limit : 10)
        .offset(query.type === 'templates' ? pagination.offset : 0)
      
      results.templates = templateResults
    }
    
    // Calculate totals
    results.total = results.users.length + results.practices.length + results.staff.length + results.templates.length
    
    // If searching all types, sort by relevance across all results
    if (query.type === 'all' && query.sort === 'relevance') {
      const allResults = [
        ...results.users,
        ...results.practices,
        ...results.staff,
        ...results.templates
      ].sort((a, b) => b.relevanceScore - a.relevanceScore)
      
      // Redistribute results maintaining type separation but ordered by relevance
      results.users = allResults.filter(r => r.type === 'user').slice(0, 5)
      results.practices = allResults.filter(r => r.type === 'practice').slice(0, 5)
      results.staff = allResults.filter(r => r.type === 'staff').slice(0, 5)
      results.templates = allResults.filter(r => r.type === 'template').slice(0, 5)
    }
    
    // Add search suggestions if no results found
    if (results.total === 0) {
      results.suggestions = await generateSearchSuggestions(query.q)
    }
    
    return createSuccessResponse(results, 'Search completed successfully')
    
  } catch (error) {
    logger.error('Search error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      query,
      operation: 'search'
    })
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request)
  }
}

function calculateRelevanceScore(field1: unknown, field2: unknown, field3: unknown, searchTerm: string): ReturnType<typeof sql<number>> {
  // Simple relevance scoring based on exact matches and position
  return sql<number>`
    case 
      when lower(${field1}) = lower(${searchTerm}) then 100
      when lower(${field2}) = lower(${searchTerm}) then 95
      when lower(${field1}) like ${`${searchTerm.toLowerCase()}%`} then 90
      when lower(${field2}) like ${`${searchTerm.toLowerCase()}%`} then 85
      when lower(${field1}) like ${`%${searchTerm.toLowerCase()}%`} then 80
      when lower(${field2}) like ${`%${searchTerm.toLowerCase()}%`} then 75
      when lower(${field3}) like ${`%${searchTerm.toLowerCase()}%`} then 70
      else 60
    end
  `
}

function getOrderBy(sort: string, order: string, entityType: string) {
  const isDesc = order === 'desc'
  
  switch (sort) {
    case 'relevance':
      return isDesc ? desc(sql`relevanceScore`) : asc(sql`relevanceScore`)
    case 'name':
      if (entityType === 'user') {
        return isDesc ? desc(sql`title`) : asc(sql`title`)
      }
      return isDesc ? desc(sql`title`) : asc(sql`title`)
    case 'created_at':
      return isDesc ? desc(sql`createdAt`) : asc(sql`createdAt`)
    case 'updated_at':
      return isDesc ? desc(sql`updatedAt`) : asc(sql`updatedAt`)
    default:
      return isDesc ? desc(sql`relevanceScore`) : asc(sql`relevanceScore`)
  }
}

async function generateSearchSuggestions(query: string): Promise<string[]> {
  try {
    // Get common terms from existing data
    const suggestions: string[] = []
    
    // Get popular practice names
    const practiceNames = await db
      .select({ name: practices.name })
      .from(practices)
      .where(isNull(practices.deleted_at))
      .limit(10)
    
    // Get popular staff titles
    const staffTitles = await db
      .select({ title: staff_members.title })
      .from(staff_members)
      .where(isNull(staff_members.deleted_at))
      .limit(10)
    
    // Simple fuzzy matching for suggestions
    const allTerms = [
      ...practiceNames.map(p => p.name),
      ...staffTitles.map(s => s.title).filter((title): title is string => title !== null),
      'rheumatology', 'doctor', 'practice', 'clinic', 'medical'
    ].filter(Boolean)
    
    // Find terms that partially match the query
    const fuzzyMatches = allTerms.filter((term): term is string => 
      typeof term === 'string' && (
        term.toLowerCase().includes(query.toLowerCase()) ||
        query.toLowerCase().includes(term.toLowerCase())
      )
    )
    
    return fuzzyMatches.slice(0, 5)
  } catch (error) {
    logger.error('Error generating suggestions', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      query,
      operation: 'generateSuggestions'
    })
    return []
  }
}

// Export with RBAC protection - search requires read access to relevant data
export const GET = rbacRoute(
  searchHandler,
  {
    permission: 'api:read:organization',
    rateLimit: 'api'
  }
);
