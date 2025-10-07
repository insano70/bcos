import { and, asc, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/lib/api/responses/error';
import { db, practice_attributes, practices, staff_members, templates, users } from '@/lib/db';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

/**
 * RBAC Practices Service
 * Manages practice CRUD operations with automatic permission checking
 */

// Types
export interface PracticeFilters {
  status?: 'active' | 'inactive' | 'pending' | undefined;
  template_id?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  sortBy?: 'name' | 'domain' | 'status' | 'created_at' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export interface CreatePracticeData {
  name: string;
  domain: string;
  template_id: string;
  owner_user_id?: string | undefined;
}

export interface UpdatePracticeData {
  name?: string | undefined;
  domain?: string | undefined;
  template_id?: string | undefined;
  status?: 'active' | 'inactive' | 'pending' | undefined;
}

export interface Practice {
  id: string;
  name: string;
  domain: string;
  status: string | null;
  template_id: string | null;
  template_name: string | null;
  owner_email: string | null;
  owner_user_id: string | null;
  created_at: Date | null;
  updated_at: Date | null;
}

export interface PracticesServiceInterface {
  getPractices(filters: PracticeFilters): Promise<Practice[]>;
  getPracticeById(id: string): Promise<Practice | null>;
  getPracticeCount(filters?: PracticeFilters): Promise<number>;
  createPractice(data: CreatePracticeData): Promise<Practice>;
  updatePractice(id: string, data: UpdatePracticeData): Promise<Practice>;
  deletePractice(id: string): Promise<boolean>;
  getPracticeAnalytics(timeframe?: string): Promise<unknown>;
  getCreationTrends(timeframe?: string): Promise<unknown>;
  getTemplateUsage(): Promise<unknown>;
  getStatusDistribution(): Promise<unknown>;
  getStaffStatistics(): Promise<unknown>;
  getPracticesWithMostStaff(limit?: number): Promise<unknown>;
  getRecentPractices(limit?: number): Promise<unknown>;
  getAttributesCompletion(): Promise<unknown>;
}

/**
 * Create an RBAC-enabled practices service instance
 */
export function createRBACPracticesService(userContext: UserContext): PracticesServiceInterface {
  // Check permissions once at service creation
  const canReadAll =
    userContext.is_super_admin ||
    userContext.all_permissions?.some((p) => p.name === 'practices:read:all');

  const canReadOwn = userContext.all_permissions?.some((p) => p.name === 'practices:read:own');

  const canCreate =
    userContext.is_super_admin ||
    userContext.all_permissions?.some((p) => p.name === 'practices:create:all');

  const canUpdate =
    userContext.is_super_admin ||
    userContext.all_permissions?.some(
      (p) =>
        p.name === 'practices:update:own' ||
        p.name === 'practices:manage:all' ||
        p.name === 'practices:create:all'
    );

  const canDelete = userContext.is_super_admin;

  return {
    async getPractices(filters: PracticeFilters): Promise<Practice[]> {
      const startTime = Date.now();

      log.info('Get practices request initiated', {
        requestingUserId: userContext.user_id,
        filters,
      });

      try {
        // Build where conditions
        const whereConditions = [isNull(practices.deleted_at)];

        // Apply RBAC filtering
        if (!canReadAll) {
          if (canReadOwn) {
            // User can only see practices they own
            whereConditions.push(eq(practices.owner_user_id, userContext.user_id));
          } else {
            // User has no practice read permissions - return empty result
            log.info('User has no practice read permissions', {
              userId: userContext.user_id,
              duration: Date.now() - startTime,
            });
            return [];
          }
        }

        // Apply additional filters
        if (filters.status) {
          whereConditions.push(eq(practices.status, filters.status));
        }

        if (filters.template_id) {
          whereConditions.push(eq(practices.template_id, filters.template_id));
        }

        // Determine sort column and order
        const sortBy = filters.sortBy || 'name';
        const sortOrder = filters.sortOrder || 'asc';
        const sortColumn =
          sortBy === 'domain'
            ? practices.domain
            : sortBy === 'status'
              ? practices.status
              : sortBy === 'created_at'
                ? practices.created_at
                : practices.name;

        // Get paginated data with joins
        const practicesData = await db
          .select({
            id: practices.practice_id,
            name: practices.name,
            domain: practices.domain,
            status: practices.status,
            template_id: practices.template_id,
            template_name: templates.name,
            owner_email: users.email,
            owner_user_id: practices.owner_user_id,
            created_at: practices.created_at,
            updated_at: practices.updated_at,
          })
          .from(practices)
          .leftJoin(templates, eq(practices.template_id, templates.template_id))
          .leftJoin(users, eq(practices.owner_user_id, users.user_id))
          .where(and(...whereConditions))
          .orderBy(sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn))
          .limit(filters.limit || 100)
          .offset(filters.offset || 0);

        log.info('Get practices completed', {
          count: practicesData.length,
          duration: Date.now() - startTime,
        });

        return practicesData;
      } catch (error) {
        log.error('Get practices failed', error, {
          userId: userContext.user_id,
          duration: Date.now() - startTime,
        });
        throw error;
      }
    },

    async getPracticeById(id: string): Promise<Practice | null> {
      const startTime = Date.now();

      log.info('Get practice by ID request initiated', {
        requestingUserId: userContext.user_id,
        practiceId: id,
      });

      try {
        // Get the practice
        const [practice] = await db
          .select({
            id: practices.practice_id,
            name: practices.name,
            domain: practices.domain,
            status: practices.status,
            template_id: practices.template_id,
            template_name: templates.name,
            owner_email: users.email,
            owner_user_id: practices.owner_user_id,
            created_at: practices.created_at,
            updated_at: practices.updated_at,
          })
          .from(practices)
          .leftJoin(templates, eq(practices.template_id, templates.template_id))
          .leftJoin(users, eq(practices.owner_user_id, users.user_id))
          .where(and(eq(practices.practice_id, id), isNull(practices.deleted_at)))
          .limit(1);

        if (!practice) {
          log.info('Practice not found', {
            practiceId: id,
            duration: Date.now() - startTime,
          });
          return null;
        }

        // Check access permissions
        if (!canReadAll && practice.owner_user_id !== userContext.user_id) {
          log.warn('Access denied to practice', {
            practiceId: id,
            userId: userContext.user_id,
            ownerId: practice.owner_user_id,
            duration: Date.now() - startTime,
          });
          throw AuthorizationError(
            'Access denied: You do not have permission to view this practice'
          );
        }

        log.info('Get practice by ID completed', {
          practiceId: id,
          duration: Date.now() - startTime,
        });

        return practice;
      } catch (error) {
        log.error('Get practice by ID failed', error, {
          practiceId: id,
          userId: userContext.user_id,
          duration: Date.now() - startTime,
        });
        throw error;
      }
    },

    async getPracticeCount(filters?: PracticeFilters): Promise<number> {
      const startTime = Date.now();

      log.info('Get practice count request initiated', {
        requestingUserId: userContext.user_id,
        filters,
      });

      try {
        // Build where conditions (same as getPractices)
        const whereConditions = [isNull(practices.deleted_at)];

        // Apply RBAC filtering
        if (!canReadAll) {
          if (canReadOwn) {
            whereConditions.push(eq(practices.owner_user_id, userContext.user_id));
          } else {
            log.info('User has no practice read permissions for count', {
              userId: userContext.user_id,
              duration: Date.now() - startTime,
            });
            return 0;
          }
        }

        // Apply additional filters
        if (filters?.status) {
          whereConditions.push(eq(practices.status, filters.status));
        }

        if (filters?.template_id) {
          whereConditions.push(eq(practices.template_id, filters.template_id));
        }

        // Get count
        const [countResult] = await db
          .select({ count: sql<number>`count(*)` })
          .from(practices)
          .where(and(...whereConditions));

        // PostgreSQL returns count as string, convert to number
        const totalCount = countResult?.count ? Number(countResult.count) : 0;

        log.info('Get practice count completed', {
          count: totalCount,
          duration: Date.now() - startTime,
        });

        return totalCount;
      } catch (error) {
        log.error('Get practice count failed', error, {
          userId: userContext.user_id,
          duration: Date.now() - startTime,
        });
        throw error;
      }
    },

    async createPractice(data: CreatePracticeData): Promise<Practice> {
      const startTime = Date.now();

      log.info('Create practice request initiated', {
        requestingUserId: userContext.user_id,
        domain: data.domain,
      });

      try {
        // Check permission
        if (!canCreate) {
          throw AuthorizationError('Access denied: You do not have permission to create practices');
        }

        // Check if domain already exists
        const existingPractice = await db
          .select()
          .from(practices)
          .where(and(eq(practices.domain, data.domain), isNull(practices.deleted_at)))
          .limit(1);

        if (existingPractice.length > 0) {
          throw ConflictError('A practice with this domain already exists');
        }

        // Verify template exists and is active
        const [template] = await db
          .select()
          .from(templates)
          .where(and(eq(templates.template_id, data.template_id), eq(templates.is_active, true)))
          .limit(1);

        if (!template) {
          throw ValidationError(null, 'Invalid template selected');
        }

        // Create practice in a transaction
        const result = await db.transaction(async (tx) => {
          // Insert practice
          const [newPractice] = await tx
            .insert(practices)
            .values({
              name: data.name,
              domain: data.domain,
              template_id: data.template_id,
              owner_user_id: data.owner_user_id || userContext.user_id,
              status: 'pending',
            })
            .returning();

          if (!newPractice) {
            throw new Error('Failed to create practice');
          }

          // Create default practice attributes
          await tx.insert(practice_attributes).values({
            practice_id: newPractice.practice_id,
            // Default business hours
            business_hours: JSON.stringify({
              sunday: { closed: true },
              monday: { open: '09:00', close: '17:00', closed: false },
              tuesday: { open: '09:00', close: '17:00', closed: false },
              wednesday: { open: '09:00', close: '17:00', closed: false },
              thursday: { open: '09:00', close: '17:00', closed: false },
              friday: { open: '09:00', close: '17:00', closed: false },
              saturday: { closed: true },
            }),
            // Default empty arrays for JSON fields
            services: JSON.stringify([]),
            insurance_accepted: JSON.stringify([]),
            conditions_treated: JSON.stringify([]),
            gallery_images: JSON.stringify([]),
            // Default brand colors
            primary_color: '#00AEEF',
            secondary_color: '#FFFFFF',
            accent_color: '#44C0AE',
          });

          return newPractice;
        });

        // Get the created practice with joins
        const [createdPractice] = await db
          .select({
            id: practices.practice_id,
            name: practices.name,
            domain: practices.domain,
            status: practices.status,
            template_id: practices.template_id,
            template_name: templates.name,
            owner_email: users.email,
            owner_user_id: practices.owner_user_id,
            created_at: practices.created_at,
            updated_at: practices.updated_at,
          })
          .from(practices)
          .leftJoin(templates, eq(practices.template_id, templates.template_id))
          .leftJoin(users, eq(practices.owner_user_id, users.user_id))
          .where(eq(practices.practice_id, result.practice_id))
          .limit(1);

        if (!createdPractice) {
          throw new Error('Failed to retrieve created practice');
        }

        log.info('Create practice completed', {
          practiceId: createdPractice.id,
          domain: createdPractice.domain,
          duration: Date.now() - startTime,
        });

        return createdPractice;
      } catch (error) {
        log.error('Create practice failed', error, {
          userId: userContext.user_id,
          domain: data.domain,
          duration: Date.now() - startTime,
        });
        throw error;
      }
    },

    async updatePractice(id: string, data: UpdatePracticeData): Promise<Practice> {
      const startTime = Date.now();

      log.info('Update practice request initiated', {
        requestingUserId: userContext.user_id,
        practiceId: id,
      });

      try {
        // Check permission
        if (!canUpdate) {
          throw AuthorizationError('Access denied: You do not have permission to update practices');
        }

        // Get existing practice
        const [existing] = await db
          .select({
            id: practices.practice_id,
            name: practices.name,
            domain: practices.domain,
            status: practices.status,
            template_id: practices.template_id,
            owner_user_id: practices.owner_user_id,
          })
          .from(practices)
          .where(and(eq(practices.practice_id, id), isNull(practices.deleted_at)))
          .limit(1);

        if (!existing) {
          throw NotFoundError('Practice');
        }

        // Check RBAC access - only super admin or owner can update
        if (!canReadAll && existing.owner_user_id !== userContext.user_id) {
          throw AuthorizationError(
            'Access denied: You do not have permission to view this practice'
          );
        }

        // Check ownership for non-super-admins
        if (!userContext.is_super_admin && existing.owner_user_id !== userContext.user_id) {
          throw AuthorizationError(
            'Access denied: You do not have permission to update this practice'
          );
        }

        // Check domain uniqueness if domain is being updated
        if (data.domain && data.domain !== existing.domain) {
          const [domainExists] = await db
            .select()
            .from(practices)
            .where(and(eq(practices.domain, data.domain), isNull(practices.deleted_at)))
            .limit(1);

          if (domainExists) {
            throw ConflictError('A practice with this domain already exists');
          }
        }

        // Update practice
        const [updatedPractice] = await db
          .update(practices)
          .set({
            ...data,
            updated_at: new Date(),
          })
          .where(eq(practices.practice_id, id))
          .returning();

        if (!updatedPractice) {
          throw new Error('Failed to update practice');
        }

        // Get the updated practice with joins
        const [practice] = await db
          .select({
            id: practices.practice_id,
            name: practices.name,
            domain: practices.domain,
            status: practices.status,
            template_id: practices.template_id,
            template_name: templates.name,
            owner_email: users.email,
            owner_user_id: practices.owner_user_id,
            created_at: practices.created_at,
            updated_at: practices.updated_at,
          })
          .from(practices)
          .leftJoin(templates, eq(practices.template_id, templates.template_id))
          .leftJoin(users, eq(practices.owner_user_id, users.user_id))
          .where(eq(practices.practice_id, id))
          .limit(1);

        if (!practice) {
          throw new Error('Failed to retrieve updated practice');
        }

        log.info('Update practice completed', {
          practiceId: id,
          duration: Date.now() - startTime,
        });

        return practice;
      } catch (error) {
        log.error('Update practice failed', error, {
          practiceId: id,
          userId: userContext.user_id,
          duration: Date.now() - startTime,
        });
        throw error;
      }
    },

    async deletePractice(id: string): Promise<boolean> {
      const startTime = Date.now();

      log.info('Delete practice request initiated', {
        requestingUserId: userContext.user_id,
        practiceId: id,
      });

      try {
        // Check permission (only super admins)
        if (!canDelete) {
          throw AuthorizationError('Access denied: Only super administrators can delete practices');
        }

        // Verify practice exists
        const [existing] = await db
          .select()
          .from(practices)
          .where(and(eq(practices.practice_id, id), isNull(practices.deleted_at)))
          .limit(1);

        if (!existing) {
          throw NotFoundError('Practice');
        }

        // Soft delete
        const [deletedPractice] = await db
          .update(practices)
          .set({
            deleted_at: new Date(),
            updated_at: new Date(),
          })
          .where(eq(practices.practice_id, id))
          .returning();

        if (!deletedPractice) {
          throw new Error('Failed to delete practice');
        }

        log.info('Delete practice completed', {
          practiceId: id,
          duration: Date.now() - startTime,
        });

        return true;
      } catch (error) {
        log.error('Delete practice failed', error, {
          practiceId: id,
          userId: userContext.user_id,
          duration: Date.now() - startTime,
        });
        throw error;
      }
    },

    /**
     * Get practice analytics for admin dashboard
     */
    getPracticeAnalytics: async (timeframe: string = '30d') => {
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

        log.info('Get practice analytics completed', {
          duration: Date.now() - startTime,
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
        log.error('Get practice analytics failed', error, {
          userId: userContext.user_id,
          duration: Date.now() - startTime,
        });
        throw error;
      }
    },

    /**
     * Get practice creation trends
     */
    getCreationTrends: async (timeframe: string = '30d') => {
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

        log.info('Get practice creation trends completed', {
          duration: Date.now() - startTime,
        });

        return creationTrend;
      } catch (error) {
        log.error('Get practice creation trends failed', error, {
          userId: userContext.user_id,
          duration: Date.now() - startTime,
        });
        throw error;
      }
    },

    /**
     * Get template usage statistics
     */
    getTemplateUsage: async () => {
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
          .leftJoin(templates, eq(practices.template_id, templates.template_id))
          .where(isNull(practices.deleted_at))
          .groupBy(practices.template_id, templates.name, templates.slug)
          .orderBy(desc(sql`count(*)`));

        log.info('Get template usage completed', {
          duration: Date.now() - startTime,
        });

        return templateUsage;
      } catch (error) {
        log.error('Get template usage failed', error, {
          userId: userContext.user_id,
          duration: Date.now() - startTime,
        });
        throw error;
      }
    },

    /**
     * Get practice status distribution
     */
    getStatusDistribution: async () => {
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

        log.info('Get status distribution completed', {
          duration: Date.now() - startTime,
        });

        return statusDistribution;
      } catch (error) {
        log.error('Get status distribution failed', error, {
          userId: userContext.user_id,
          duration: Date.now() - startTime,
        });
        throw error;
      }
    },

    /**
     * Get staff statistics
     */
    getStaffStatistics: async () => {
      const startTime = Date.now();

      try {
        const [staffStats] = await db
          .select({
            totalStaff: sql<number>`count(*)`,
            averageStaffPerPractice: sql<number>`round(count(*)::decimal / nullif(count(distinct practice_id), 0), 2)`,
          })
          .from(staff_members)
          .where(isNull(staff_members.deleted_at));

        log.info('Get staff statistics completed', {
          duration: Date.now() - startTime,
        });

        return staffStats || {
          totalStaff: 0,
          averageStaffPerPractice: 0,
        };
      } catch (error) {
        log.error('Get staff statistics failed', error, {
          userId: userContext.user_id,
          duration: Date.now() - startTime,
        });
        throw error;
      }
    },

    /**
     * Get practices with most staff
     */
    getPracticesWithMostStaff: async (limit: number = 10) => {
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
          .leftJoin(staff_members, eq(practices.practice_id, staff_members.practice_id))
          .where(and(isNull(practices.deleted_at), isNull(staff_members.deleted_at)))
          .groupBy(practices.practice_id, practices.name, practices.domain)
          .orderBy(desc(sql`count(${staff_members.staff_id})`))
          .limit(limit);

        log.info('Get practices with most staff completed', {
          duration: Date.now() - startTime,
        });

        return practicesWithMostStaff;
      } catch (error) {
        log.error('Get practices with most staff failed', error, {
          userId: userContext.user_id,
          duration: Date.now() - startTime,
        });
        throw error;
      }
    },

    /**
     * Get recent practices
     */
    getRecentPractices: async (limit: number = 10) => {
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

        log.info('Get recent practices completed', {
          duration: Date.now() - startTime,
        });

        return recentPractices;
      } catch (error) {
        log.error('Get recent practices failed', error, {
          userId: userContext.user_id,
          duration: Date.now() - startTime,
        });
        throw error;
      }
    },

    /**
     * Get practice attributes completion stats
     */
    getAttributesCompletion: async () => {
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

        log.info('Get attributes completion completed', {
          duration: Date.now() - startTime,
        });

        return attributesCompletion || {
          totalWithAttributes: 0,
          withBusinessHours: 0,
          withServices: 0,
          withInsurance: 0,
          withConditions: 0,
          withColors: 0,
        };
      } catch (error) {
        log.error('Get attributes completion failed', error, {
          userId: userContext.user_id,
          duration: Date.now() - startTime,
        });
        throw error;
      }
    },
  };
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
