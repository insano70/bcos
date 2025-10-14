import { and, asc, count, desc, eq, isNull } from 'drizzle-orm';
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/lib/api/responses/error';
import { db, practice_attributes, practices, templates, users } from '@/lib/db';
import { SLOW_THRESHOLDS, log } from '@/lib/logger';
import { calculateChanges, logTemplates, sanitizeFilters } from '@/lib/logger/message-templates';
import { getPracticeQueryBuilder } from '@/lib/services/practices/query-builder';
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
}

/**
 * Internal practices service class
 * Implements all CRUD operations with RBAC enforcement
 */
class PracticesService implements PracticesServiceInterface {
  private canReadAll: boolean;
  private canReadOwn: boolean;
  private canCreate: boolean;
  private canUpdate: boolean;
  private canDelete: boolean;

  constructor(private userContext: UserContext) {
    // Check permissions once at service creation
    this.canReadAll =
      userContext.is_super_admin ||
      userContext.all_permissions?.some((p) => p.name === 'practices:read:all');

    this.canReadOwn = userContext.all_permissions?.some((p) => p.name === 'practices:read:own');

    this.canCreate =
      userContext.is_super_admin ||
      userContext.all_permissions?.some((p) => p.name === 'practices:create:all');

    this.canUpdate =
      userContext.is_super_admin ||
      userContext.all_permissions?.some(
        (p) =>
          p.name === 'practices:update:own' ||
          p.name === 'practices:manage:all' ||
          p.name === 'practices:create:all'
      );

    this.canDelete = userContext.is_super_admin;
  }

  /**
   * Get practices with filtering, pagination, and sorting
   */
  async getPractices(filters: PracticeFilters): Promise<Practice[]> {
    const startTime = Date.now();

    try {
      // Build where conditions
      const whereConditions = [isNull(practices.deleted_at)];

      // Apply RBAC filtering
      if (!this.canReadAll) {
        if (this.canReadOwn) {
          // User can only see practices they own
          whereConditions.push(eq(practices.owner_user_id, this.userContext.user_id));
        } else {
          // User has no practice read permissions - return empty result
          const logTemplate = logTemplates.crud.list('practices', {
            userId: this.userContext.user_id,
            filters: sanitizeFilters(filters as Record<string, unknown>),
            results: { returned: 0, total: 0, page: 1 },
            duration: Date.now() - startTime,
            metadata: {
              rbacResult: 'no_permissions',
              component: 'business-logic',
            },
          });
          log.info(logTemplate.message, logTemplate.context);
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

      // Count total matching records
      const countStart = Date.now();
      const [countResult] = await db
        .select({ count: count() })
        .from(practices)
        .where(and(...whereConditions));
      const countDuration = Date.now() - countStart;
      const totalCount = countResult?.count ? Number(countResult.count) : 0;

      // Get paginated data with joins
      const queryStart = Date.now();
      const practicesData = await db
        .select(getPracticeQueryBuilder())
        .from(practices)
        .leftJoin(templates, eq(practices.template_id, templates.template_id))
        .leftJoin(users, eq(practices.owner_user_id, users.user_id))
        .where(and(...whereConditions))
        .orderBy(sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn))
        .limit(filters.limit || 100)
        .offset(filters.offset || 0);
      const queryDuration = Date.now() - queryStart;

      const duration = Date.now() - startTime;
      const page = Math.floor((filters.offset || 0) / (filters.limit || 100)) + 1;

      const logTemplate = logTemplates.crud.list('practices', {
        userId: this.userContext.user_id,
        ...(this.userContext.current_organization_id && {
          organizationId: this.userContext.current_organization_id,
        }),
        filters: sanitizeFilters(filters as Record<string, unknown>),
        results: {
          returned: practicesData.length,
          total: totalCount,
          page,
          hasMore: (filters.offset || 0) + practicesData.length < totalCount,
        },
        duration,
        metadata: {
          query: {
            duration: queryDuration,
            slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
          },
          count: {
            duration: countDuration,
            slow: countDuration > SLOW_THRESHOLDS.DB_QUERY,
          },
          rbacScope: this.canReadAll ? 'all' : 'own',
          component: 'business-logic',
        },
      });
      log.info(logTemplate.message, logTemplate.context);

      return practicesData;
    } catch (error) {
      log.error('list practices failed', error, {
        operation: 'list_practices',
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'business-logic',
      });
      throw error;
    }
  }

  /**
   * Get a single practice by ID with RBAC enforcement
   */
  async getPracticeById(id: string): Promise<Practice | null> {
    const startTime = Date.now();

    try {
      // Get the practice
      const [practice] = await db
        .select(getPracticeQueryBuilder())
        .from(practices)
        .leftJoin(templates, eq(practices.template_id, templates.template_id))
        .leftJoin(users, eq(practices.owner_user_id, users.user_id))
        .where(and(eq(practices.practice_id, id), isNull(practices.deleted_at)))
        .limit(1);

      if (!practice) {
        const logTemplate = logTemplates.crud.read('practice', {
          resourceId: id,
          userId: this.userContext.user_id,
          duration: Date.now() - startTime,
          found: false,
          metadata: { component: 'business-logic' },
        });
        log.info(logTemplate.message, logTemplate.context);
        return null;
      }

      // Check access permissions
      if (!this.canReadAll && practice.owner_user_id !== this.userContext.user_id) {
        log.error('access denied to practice', new Error('Authorization failed'), {
          operation: 'read_practice',
          resourceId: id,
          userId: this.userContext.user_id,
          ownerId: practice.owner_user_id,
          duration: Date.now() - startTime,
          component: 'business-logic',
        });
        throw AuthorizationError(
          'Access denied: You do not have permission to view this practice'
        );
      }

      const logTemplate = logTemplates.crud.read('practice', {
        resourceId: id,
        resourceName: practice.name,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        found: true,
        metadata: {
          domain: practice.domain,
          status: practice.status,
          rbacScope: this.canReadAll ? 'all' : 'own',
          component: 'business-logic',
        },
      });
      log.info(logTemplate.message, logTemplate.context);

      return practice;
    } catch (error) {
      if (error instanceof AuthorizationError) {
        throw error;
      }
      log.error('read practice failed', error, {
        operation: 'read_practice',
        resourceId: id,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'business-logic',
      });
      throw error;
    }
  }

  /**
   * Get count of practices matching filters
   */
  async getPracticeCount(filters?: PracticeFilters): Promise<number> {
    const startTime = Date.now();

    try {
      // Build where conditions (same as getPractices)
      const whereConditions = [isNull(practices.deleted_at)];

      // Apply RBAC filtering
      if (!this.canReadAll) {
        if (this.canReadOwn) {
          whereConditions.push(eq(practices.owner_user_id, this.userContext.user_id));
        } else {
          log.info('practice count query - no permissions', {
            operation: 'count_practices',
            userId: this.userContext.user_id,
            duration: Date.now() - startTime,
            count: 0,
            component: 'business-logic',
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
        .select({ count: count() })
        .from(practices)
        .where(and(...whereConditions));

      const totalCount = countResult?.count ? Number(countResult.count) : 0;
      const duration = Date.now() - startTime;

      log.info('practice count query completed', {
        operation: 'count_practices',
        userId: this.userContext.user_id,
        count: totalCount,
        duration,
        slow: duration > SLOW_THRESHOLDS.DB_QUERY,
        filters: sanitizeFilters((filters || {}) as Record<string, unknown>),
        rbacScope: this.canReadAll ? 'all' : 'own',
        component: 'business-logic',
      });

      return totalCount;
    } catch (error) {
      log.error('count practices failed', error, {
        operation: 'count_practices',
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'business-logic',
      });
      throw error;
    }
  }

  /**
   * Create a new practice with default attributes
   */
  async createPractice(data: CreatePracticeData): Promise<Practice> {
    const startTime = Date.now();

    try {
      // Check permission
      if (!this.canCreate) {
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
            owner_user_id: data.owner_user_id || this.userContext.user_id,
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
        .select(getPracticeQueryBuilder())
        .from(practices)
        .leftJoin(templates, eq(practices.template_id, templates.template_id))
        .leftJoin(users, eq(practices.owner_user_id, users.user_id))
        .where(eq(practices.practice_id, result.practice_id))
        .limit(1);

      if (!createdPractice) {
        throw new Error('Failed to retrieve created practice');
      }

      const duration = Date.now() - startTime;
      const logTemplate = logTemplates.crud.create('practice', {
        resourceId: createdPractice.id,
        resourceName: createdPractice.name,
        userId: this.userContext.user_id,
        ...(this.userContext.current_organization_id && {
          organizationId: this.userContext.current_organization_id,
        }),
        duration,
        metadata: {
          domain: createdPractice.domain,
          templateId: createdPractice.template_id,
          templateName: createdPractice.template_name,
          status: createdPractice.status,
          slow: duration > SLOW_THRESHOLDS.AUTH_OPERATION,
          component: 'business-logic',
        },
      });
      log.info(logTemplate.message, logTemplate.context);

      return createdPractice;
    } catch (error) {
      log.error('create practice failed', error, {
        operation: 'create_practice',
        userId: this.userContext.user_id,
        domain: data.domain,
        duration: Date.now() - startTime,
        component: 'business-logic',
      });
      throw error;
    }
  }

  /**
   * Update an existing practice
   */
  async updatePractice(id: string, data: UpdatePracticeData): Promise<Practice> {
    const startTime = Date.now();

    try {
      // Check permission
      if (!this.canUpdate) {
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
      if (!this.canReadAll && existing.owner_user_id !== this.userContext.user_id) {
        throw AuthorizationError(
          'Access denied: You do not have permission to view this practice'
        );
      }

      // Check ownership for non-super-admins
      if (!this.userContext.is_super_admin && existing.owner_user_id !== this.userContext.user_id) {
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
        .select(getPracticeQueryBuilder())
        .from(practices)
        .leftJoin(templates, eq(practices.template_id, templates.template_id))
        .leftJoin(users, eq(practices.owner_user_id, users.user_id))
        .where(eq(practices.practice_id, id))
        .limit(1);

      if (!practice) {
        throw new Error('Failed to retrieve updated practice');
      }

      // Calculate changes for audit trail
      const changes = calculateChanges(
        existing as unknown as Record<string, unknown>,
        data as unknown as Record<string, unknown>,
        ['name', 'domain', 'status', 'template_id']
      );
      const duration = Date.now() - startTime;

      const logTemplate = logTemplates.crud.update('practice', {
        resourceId: id,
        resourceName: practice.name,
        userId: this.userContext.user_id,
        ...(this.userContext.current_organization_id && {
          organizationId: this.userContext.current_organization_id,
        }),
        changes,
        duration,
        metadata: {
          domain: practice.domain,
          status: practice.status,
          slow: duration > SLOW_THRESHOLDS.AUTH_OPERATION,
          component: 'business-logic',
        },
      });
      log.info(logTemplate.message, logTemplate.context);

      return practice;
    } catch (error) {
      log.error('update practice failed', error, {
        operation: 'update_practice',
        resourceId: id,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'business-logic',
      });
      throw error;
    }
  }

  /**
   * Delete a practice (soft delete)
   */
  async deletePractice(id: string): Promise<boolean> {
    const startTime = Date.now();

    try {
      // Check permission (only super admins)
      if (!this.canDelete) {
        throw AuthorizationError('Access denied: Only super administrators can delete practices');
      }

      // Verify practice exists
      const [existing] = await db
        .select({
          id: practices.practice_id,
          name: practices.name,
          domain: practices.domain,
        })
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

      const duration = Date.now() - startTime;
      const logTemplate = logTemplates.crud.delete('practice', {
        resourceId: id,
        resourceName: existing.name,
        userId: this.userContext.user_id,
        ...(this.userContext.current_organization_id && {
          organizationId: this.userContext.current_organization_id,
        }),
        soft: true,
        duration,
        metadata: {
          domain: existing.domain,
          component: 'business-logic',
        },
      });
      log.info(logTemplate.message, logTemplate.context);

      return true;
    } catch (error) {
      log.error('delete practice failed', error, {
        operation: 'delete_practice',
        resourceId: id,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'business-logic',
      });
      throw error;
    }
  }
}

/**
 * Create an RBAC-enabled practices service instance
 */
export function createRBACPracticesService(userContext: UserContext): PracticesServiceInterface {
  return new PracticesService(userContext);
}
