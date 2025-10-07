import { db, users, practices, staff_members, templates } from '@/lib/db';
import { sql, eq, isNull, like, or, and, desc, asc } from 'drizzle-orm';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

/**
 * RBAC Search Service
 * Provides universal search across users, practices, staff, and templates with automatic RBAC filtering
 */

// Types
export interface SearchFilters {
  query: string;
  type: 'all' | 'users' | 'practices' | 'staff' | 'templates';
  status?: 'active' | 'inactive' | 'all';
  sort?: 'relevance' | 'name' | 'created_at' | 'updated_at';
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface UserSearchResult {
  id: string;
  type: 'user';
  title: string;
  subtitle: string;
  status: string;
  verified: boolean;
  createdAt: Date;
  updatedAt: Date;
  relevanceScore: number;
}

export interface PracticeSearchResult {
  id: string;
  type: 'practice';
  title: string;
  subtitle: string;
  status: string;
  templateId: string | null;
  createdAt: Date;
  updatedAt: Date;
  relevanceScore: number;
}

export interface StaffSearchResult {
  id: string;
  type: 'staff';
  title: string;
  subtitle: string | null;
  practiceId: string;
  specialties: string | null;
  createdAt: Date;
  updatedAt: Date;
  relevanceScore: number;
}

export interface TemplateSearchResult {
  id: string;
  type: 'template';
  title: string;
  subtitle: string | null;
  slug: string;
  status: string;
  previewImage: string | null;
  createdAt: Date;
  updatedAt: Date;
  relevanceScore: number;
}

export interface SearchResults {
  users: UserSearchResult[];
  practices: PracticeSearchResult[];
  staff: StaffSearchResult[];
  templates: TemplateSearchResult[];
  total: number;
  query: string;
  type: string;
  suggestions?: string[];
}

export interface SearchServiceInterface {
  search(filters: SearchFilters): Promise<SearchResults>;
}

/**
 * Create an RBAC-enabled search service instance
 */
export function createRBACSearchService(
  userContext: UserContext
): SearchServiceInterface {
  // Check permissions once at service creation
  const canReadUsers = userContext.is_super_admin || userContext.all_permissions?.some(p =>
    p.name === 'users:read:own' || p.name === 'users:read:organization' || p.name === 'users:read:all'
  );

  const canReadPractices = userContext.is_super_admin || userContext.all_permissions?.some(p =>
    p.name === 'practices:read:own' || p.name === 'practices:read:all'
  );

  /**
   * Sanitize search query to prevent SQL injection
   */
  function sanitizeQuery(query: string): string {
    return query
      .trim()
      .replace(/[%_\\]/g, '\\$&') // Escape SQL wildcards
      .replace(/[<>"']/g, '') // Remove dangerous characters
      .slice(0, 255); // Limit length
  }

  /**
   * Calculate relevance score for search results
   */
  function calculateRelevanceScore(
    field1: unknown,
    field2: unknown,
    field3: unknown,
    searchTerm: string
  ): ReturnType<typeof sql<number>> {
    const lowerSearchTerm = searchTerm.toLowerCase();
    return sql<number>`
      case
        when lower(${field1}) = ${lowerSearchTerm} then 100
        when lower(${field2}) = ${lowerSearchTerm} then 95
        when lower(${field1}) like ${`${lowerSearchTerm}%`} then 90
        when lower(${field2}) like ${`${lowerSearchTerm}%`} then 85
        when lower(${field1}) like ${`%${lowerSearchTerm}%`} then 80
        when lower(${field2}) like ${`%${lowerSearchTerm}%`} then 75
        when lower(${field3}) like ${`%${lowerSearchTerm}%`} then 70
        else 60
      end
    `;
  }

  /**
   * Sort search results in memory
   */
  function sortSearchResults<T extends { relevanceScore?: number; title?: string; createdAt?: Date; updatedAt?: Date }>(
    results: T[],
    sort: string,
    order: string
  ): T[] {
    const multiplier = order === 'desc' ? -1 : 1;

    return results.sort((a, b) => {
      switch (sort) {
        case 'relevance':
          return multiplier * ((b.relevanceScore || 0) - (a.relevanceScore || 0));
        case 'name':
          return multiplier * ((a.title || '').localeCompare(b.title || ''));
        case 'created_at':
          return multiplier * ((a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));
        case 'updated_at':
          return multiplier * ((a.updatedAt?.getTime() || 0) - (b.updatedAt?.getTime() || 0));
        default:
          return multiplier * ((b.relevanceScore || 0) - (a.relevanceScore || 0));
      }
    });
  }

  /**
   * Generate search suggestions when no results found
   */
  async function generateSearchSuggestions(query: string): Promise<string[]> {
    try {
      const suggestions: string[] = [];

      // Get popular practice names
      const practiceNames = await db
        .select({ name: practices.name })
        .from(practices)
        .where(isNull(practices.deleted_at))
        .limit(10);

      // Get popular staff titles
      const staffTitles = await db
        .select({ title: staff_members.title })
        .from(staff_members)
        .where(isNull(staff_members.deleted_at))
        .limit(10);

      // Combine terms with common medical terms
      const allTerms = [
        ...practiceNames.map(p => p.name),
        ...staffTitles.map(s => s.title).filter((title): title is string => title !== null),
        'rheumatology',
        'doctor',
        'practice',
        'clinic',
        'medical'
      ].filter(Boolean);

      // Find terms that partially match the query
      const fuzzyMatches = allTerms.filter(
        (term): term is string =>
          typeof term === 'string' &&
          (term.toLowerCase().includes(query.toLowerCase()) ||
            query.toLowerCase().includes(term.toLowerCase()))
      );

      return fuzzyMatches.slice(0, 5);
    } catch (error) {
      log.error('Error generating search suggestions', error, {
        query,
        operation: 'generateSuggestions'
      });
      return [];
    }
  }

  /**
   * Search users
   */
  async function searchUsers(
    searchTerm: string,
    filters: SearchFilters
  ): Promise<UserSearchResult[]> {
    if (!canReadUsers) {
      return [];
    }

    const startTime = Date.now();

    try {
      const likeSearchTerm = `%${searchTerm}%`;
      const userConditions = [
        isNull(users.deleted_at),
        or(
          like(sql`lower(${users.first_name})`, likeSearchTerm),
          like(sql`lower(${users.last_name})`, likeSearchTerm),
          like(sql`lower(${users.email})`, likeSearchTerm),
          like(sql`lower(concat(${users.first_name}, ' ', ${users.last_name}))`, likeSearchTerm)
        )
      ];

      if (filters.status && filters.status !== 'all') {
        userConditions.push(eq(users.is_active, filters.status === 'active'));
      }

      const userResults = await db
        .select({
          id: users.user_id,
          type: sql<'user'>`'user'`,
          title: sql<string>`concat(${users.first_name}, ' ', ${users.last_name})`,
          subtitle: users.email,
          status: sql<string>`case when ${users.is_active} then 'active' else 'inactive' end`,
          verified: users.email_verified,
          createdAt: users.created_at,
          updatedAt: users.updated_at,
          relevanceScore: calculateRelevanceScore(users.first_name, users.last_name, users.email, filters.query)
        })
        .from(users)
        .where(and(...userConditions))
        .limit(filters.type === 'users' ? (filters.limit || 50) : 10)
        .offset(filters.type === 'users' ? (filters.offset || 0) : 0);

      // Sort results in-memory based on sort parameter
      const sortedResults = sortSearchResults(userResults, filters.sort || 'relevance', filters.order || 'desc');

      log.info('User search completed', {
        count: sortedResults.length,
        duration: Date.now() - startTime
      });

      return sortedResults;
    } catch (error) {
      log.error('User search failed', error, {
        duration: Date.now() - startTime
      });
      throw error;
    }
  }

  /**
   * Search practices
   */
  async function searchPractices(
    searchTerm: string,
    filters: SearchFilters
  ): Promise<PracticeSearchResult[]> {
    if (!canReadPractices) {
      return [];
    }

    const startTime = Date.now();

    try {
      const likeSearchTerm = `%${searchTerm}%`;
      const practiceConditions = [
        isNull(practices.deleted_at),
        or(
          like(sql`lower(${practices.name})`, likeSearchTerm),
          like(sql`lower(${practices.domain})`, likeSearchTerm)
        )
      ];

      if (filters.status && filters.status !== 'all') {
        practiceConditions.push(eq(practices.status, filters.status));
      }

      const practiceResults = await db
        .select({
          id: practices.practice_id,
          type: sql<'practice'>`'practice'`,
          title: practices.name,
          subtitle: practices.domain,
          status: practices.status,
          templateId: practices.template_id,
          createdAt: practices.created_at,
          updatedAt: practices.updated_at,
          relevanceScore: calculateRelevanceScore(practices.name, practices.domain, sql`''`, filters.query)
        })
        .from(practices)
        .where(and(...practiceConditions))
        .limit(filters.type === 'practices' ? (filters.limit || 50) : 10)
        .offset(filters.type === 'practices' ? (filters.offset || 0) : 0);

      // Sort results in-memory
      const sortedResults = sortSearchResults(practiceResults, filters.sort || 'relevance', filters.order || 'desc');

      log.info('Practice search completed', {
        count: sortedResults.length,
        duration: Date.now() - startTime
      });

      return sortedResults;
    } catch (error) {
      log.error('Practice search failed', error, {
        duration: Date.now() - startTime
      });
      throw error;
    }
  }

  /**
   * Search staff members
   */
  async function searchStaff(
    searchTerm: string,
    filters: SearchFilters
  ): Promise<StaffSearchResult[]> {
    if (!canReadPractices) {
      return [];
    }

    const startTime = Date.now();

    try {
      const likeSearchTerm = `%${searchTerm}%`;
      const staffConditions = [
        isNull(staff_members.deleted_at),
        or(
          like(sql`lower(${staff_members.name})`, likeSearchTerm),
          like(sql`lower(${staff_members.title})`, likeSearchTerm),
          like(sql`lower(${staff_members.specialties})`, likeSearchTerm),
          like(sql`lower(${staff_members.bio})`, likeSearchTerm)
        )
      ];

      const staffResults = await db
        .select({
          id: staff_members.staff_id,
          type: sql<'staff'>`'staff'`,
          title: staff_members.name,
          subtitle: staff_members.title,
          practiceId: staff_members.practice_id,
          specialties: staff_members.specialties,
          createdAt: staff_members.created_at,
          updatedAt: staff_members.updated_at,
          relevanceScore: calculateRelevanceScore(
            staff_members.name,
            staff_members.title,
            staff_members.bio,
            filters.query
          )
        })
        .from(staff_members)
        .where(and(...staffConditions))
        .limit(filters.type === 'staff' ? (filters.limit || 50) : 10)
        .offset(filters.type === 'staff' ? (filters.offset || 0) : 0);

      // Sort results in-memory
      const sortedResults = sortSearchResults(staffResults, filters.sort || 'relevance', filters.order || 'desc');

      log.info('Staff search completed', {
        count: sortedResults.length,
        duration: Date.now() - startTime
      });

      return sortedResults;
    } catch (error) {
      log.error('Staff search failed', error, {
        duration: Date.now() - startTime
      });
      throw error;
    }
  }

  /**
   * Search templates
   */
  async function searchTemplates(
    searchTerm: string,
    filters: SearchFilters
  ): Promise<TemplateSearchResult[]> {
    if (!canReadUsers && !canReadPractices) {
      return [];
    }

    const startTime = Date.now();

    try {
      const likeSearchTerm = `%${searchTerm}%`;
      const templateConditions = [
        isNull(templates.deleted_at),
        or(
          like(sql`lower(${templates.name})`, likeSearchTerm),
          like(sql`lower(${templates.slug})`, likeSearchTerm),
          like(sql`lower(${templates.description})`, likeSearchTerm)
        )
      ];

      if (filters.status && filters.status !== 'all') {
        templateConditions.push(eq(templates.is_active, filters.status === 'active'));
      }

      const templateResults = await db
        .select({
          id: templates.template_id,
          type: sql<'template'>`'template'`,
          title: templates.name,
          subtitle: templates.description,
          slug: templates.slug,
          status: sql<string>`case when ${templates.is_active} then 'active' else 'inactive' end`,
          previewImage: templates.preview_image_url,
          createdAt: templates.created_at,
          updatedAt: templates.updated_at,
          relevanceScore: calculateRelevanceScore(templates.name, templates.description, sql`''`, filters.query)
        })
        .from(templates)
        .where(and(...templateConditions))
        .limit(filters.type === 'templates' ? (filters.limit || 50) : 10)
        .offset(filters.type === 'templates' ? (filters.offset || 0) : 0);

      // Sort results in-memory
      const sortedResults = sortSearchResults(templateResults, filters.sort || 'relevance', filters.order || 'desc');

      log.info('Template search completed', {
        count: sortedResults.length,
        duration: Date.now() - startTime
      });

      return sortedResults;
    } catch (error) {
      log.error('Template search failed', error, {
        duration: Date.now() - startTime
      });
      throw error;
    }
  }

  return {
    async search(filters: SearchFilters): Promise<SearchResults> {
      const startTime = Date.now();

      log.info('Search request initiated', {
        requestingUserId: userContext.user_id,
        query: filters.query,
        type: filters.type
      });

      try {
        // Sanitize search term
        const sanitizedQuery = sanitizeQuery(filters.query);
        const searchTerm = sanitizedQuery.toLowerCase();

        const results: SearchResults = {
          users: [],
          practices: [],
          staff: [],
          templates: [],
          total: 0,
          query: filters.query,
          type: filters.type
        };

        // Execute searches based on type
        if (filters.type === 'all' || filters.type === 'users') {
          results.users = await searchUsers(searchTerm, filters);
        }

        if (filters.type === 'all' || filters.type === 'practices') {
          results.practices = await searchPractices(searchTerm, filters);
        }

        if (filters.type === 'all' || filters.type === 'staff') {
          results.staff = await searchStaff(searchTerm, filters);
        }

        if (filters.type === 'all' || filters.type === 'templates') {
          results.templates = await searchTemplates(searchTerm, filters);
        }

        // Calculate total
        results.total =
          results.users.length +
          results.practices.length +
          results.staff.length +
          results.templates.length;

        // If searching all types and sorting by relevance, sort across all results
        if (filters.type === 'all' && filters.sort === 'relevance') {
          const allResults = [
            ...results.users,
            ...results.practices,
            ...results.staff,
            ...results.templates
          ].sort((a, b) => b.relevanceScore - a.relevanceScore);

          // Redistribute results maintaining type separation but ordered by relevance
          results.users = allResults.filter((r): r is UserSearchResult => r.type === 'user').slice(0, 5);
          results.practices = allResults.filter((r): r is PracticeSearchResult => r.type === 'practice').slice(0, 5);
          results.staff = allResults.filter((r): r is StaffSearchResult => r.type === 'staff').slice(0, 5);
          results.templates = allResults.filter((r): r is TemplateSearchResult => r.type === 'template').slice(0, 5);
        }

        // Add search suggestions if no results found
        if (results.total === 0) {
          results.suggestions = await generateSearchSuggestions(filters.query);
        }

        log.info('Search completed', {
          total: results.total,
          duration: Date.now() - startTime
        });

        return results;
      } catch (error) {
        log.error('Search failed', error, {
          userId: userContext.user_id,
          query: filters.query,
          duration: Date.now() - startTime
        });
        throw error;
      }
    }
  };
}
