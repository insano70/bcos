import { and, asc, desc, eq, isNull, like, type SQL, sql } from 'drizzle-orm';
import { AuthorizationError, NotFoundError } from '@/lib/api/responses/error';
import { db, staff_members } from '@/lib/db';
import { calculateChanges, log, logTemplates, SLOW_THRESHOLDS } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import { parseEducation, parseSpecialties } from '@/lib/utils/safe-json';
import { verifyPracticeAccess } from './rbac-practice-utils';

/**
 * RBAC Staff Members Service
 * Manages practice staff CRUD operations with automatic permission checking
 */

export interface StaffMember {
  staff_id: string;
  practice_id: string | null;
  name: string;
  title: string | null;
  credentials?: string | null;
  bio?: string | null;
  photo_url?: string | null;
  email?: string | null;
  phone?: string | null;
  specialties?: unknown;
  education?: unknown;
  is_active: boolean | null;
  display_order: number | null;
  created_at: Date | null;
  updated_at: Date | null;
  deleted_at?: Date | null;
}

export interface StaffFilters {
  is_active?: boolean | undefined;
  search?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  sortBy?: string | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export interface CreateStaffData {
  name: string;
  title?: string | undefined;
  credentials?: string | undefined;
  bio?: string | undefined;
  photo_url?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
  specialties?: unknown;
  education?: unknown;
  is_active?: boolean | undefined;
  practice_id?: string | undefined;
  display_order?: number | undefined;
}

export interface UpdateStaffData {
  name?: string | undefined;
  title?: string | undefined;
  credentials?: string | undefined;
  bio?: string | undefined;
  photo_url?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
  specialties?: unknown;
  education?: unknown;
  is_active?: boolean | undefined;
  display_order?: number | undefined;
}

export interface StaffMembersServiceInterface {
  getStaffMembers(
    practiceId: string,
    filters: StaffFilters
  ): Promise<{ staff: StaffMember[]; total: number }>;
  getStaffMember(practiceId: string, staffId: string): Promise<StaffMember>;
  createStaffMember(practiceId: string, data: CreateStaffData): Promise<StaffMember>;
  updateStaffMember(
    practiceId: string,
    staffId: string,
    data: UpdateStaffData
  ): Promise<StaffMember>;
  deleteStaffMember(practiceId: string, staffId: string): Promise<boolean>;
  reorderStaff(
    practiceId: string,
    staffOrder: { staff_id: string; display_order: number }[]
  ): Promise<boolean>;
}

/**
 * Internal Staff Members Service Implementation
 *
 * Uses hybrid pattern: internal class with factory function.
 * Provides full CRUD operations for staff members with automatic RBAC enforcement.
 */
class StaffMembersService implements StaffMembersServiceInterface {
  private readonly canManageStaff: boolean;

  constructor(private readonly userContext: UserContext) {
    // Cache permission check once in constructor
    this.canManageStaff =
      userContext.is_super_admin ||
      userContext.all_permissions?.some(
        (p) => p.name === 'practices:staff:manage:own' || p.name === 'practices:manage:all'
      ) ||
      false;
  }

  /**
   * Build where conditions for staff queries
   * @param practiceId - Practice ID to filter by
   * @param filters - Additional filters
   * @returns Array of SQL where conditions
   */
  private buildStaffWhereConditions(practiceId: string, filters: StaffFilters): SQL[] {
    const conditions: SQL[] = [
      eq(staff_members.practice_id, practiceId),
      isNull(staff_members.deleted_at),
    ];

    if (filters.is_active !== undefined) {
      conditions.push(eq(staff_members.is_active, filters.is_active));
    }

    if (filters.search) {
      conditions.push(like(staff_members.name, `%${filters.search}%`));
    }

    return conditions;
  }

  /**
   * Parse JSON fields in staff member
   * @param member - Raw staff member from database
   * @returns Staff member with parsed JSON fields
   */
  private parseStaffMemberJSON(member: typeof staff_members.$inferSelect): StaffMember {
    return {
      ...member,
      specialties: parseSpecialties(member.specialties),
      education: parseEducation(member.education),
    };
  }

  async getStaffMembers(
    practiceId: string,
    filters: StaffFilters
  ): Promise<{ staff: StaffMember[]; total: number }> {
    const startTime = Date.now();

    try {
      // Verify practice access
      await verifyPracticeAccess(practiceId, this.userContext);

      // Build where conditions
      const whereConditions = this.buildStaffWhereConditions(practiceId, filters);

      // Get total count with performance tracking
      const countStart = Date.now();
      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(staff_members)
        .where(and(...whereConditions));
      const countDuration = Date.now() - countStart;

      // Get paginated data with performance tracking
      const orderByColumn =
        filters.sortBy === 'name'
          ? staff_members.name
          : filters.sortBy === 'title'
            ? staff_members.title
            : filters.sortBy === 'created_at'
              ? staff_members.created_at
              : staff_members.display_order;

      const queryStart = Date.now();
      const staff = await db
        .select()
        .from(staff_members)
        .where(and(...whereConditions))
        .orderBy(filters.sortOrder === 'desc' ? desc(orderByColumn) : asc(orderByColumn))
        .limit(filters.limit || 100)
        .offset(filters.offset || 0);
      const queryDuration = Date.now() - queryStart;

      // Parse JSON fields
      const parsedStaff = staff.map((member) => this.parseStaffMemberJSON(member));

      const duration = Date.now() - startTime;
      const total = Number(countResult?.count || 0);

      // Use logTemplates for structured logging
      const template = logTemplates.crud.list('staff_members', {
        userId: this.userContext.user_id,
        filters: {
          is_active: filters.is_active,
          search: filters.search,
          limit: filters.limit,
          offset: filters.offset,
        },
        results: {
          returned: staff.length,
          total,
          page: Math.floor((filters.offset || 0) / (filters.limit || 100)) + 1,
        },
        duration,
        metadata: {
          practiceId,
          countDuration,
          queryDuration,
          slowCount: countDuration > SLOW_THRESHOLDS.DB_QUERY,
          slowQuery: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
        },
      });

      log.info(template.message, template.context);

      return { staff: parsedStaff, total };
    } catch (error) {
      log.error('list staff members failed', error, {
        operation: 'list_staff_members',
        practiceId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });
      throw error;
    }
  }

  async getStaffMember(practiceId: string, staffId: string): Promise<StaffMember> {
    const startTime = Date.now();

    try {
      // Verify practice access
      await verifyPracticeAccess(practiceId, this.userContext);

      // Get staff member with performance tracking
      const queryStart = Date.now();
      const [member] = await db
        .select()
        .from(staff_members)
        .where(
          and(
            eq(staff_members.staff_id, staffId),
            eq(staff_members.practice_id, practiceId),
            isNull(staff_members.deleted_at)
          )
        )
        .limit(1);
      const queryDuration = Date.now() - queryStart;

      if (!member) {
        throw NotFoundError('Staff member');
      }

      const parsedMember = this.parseStaffMemberJSON(member);
      const duration = Date.now() - startTime;

      // Use logTemplates for structured logging
      const template = logTemplates.crud.read('staff_member', {
        resourceId: staffId,
        resourceName: member.name,
        userId: this.userContext.user_id,
        found: true,
        duration,
        metadata: {
          practiceId,
          queryDuration,
          slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
        },
      });

      log.info(template.message, template.context);

      return parsedMember;
    } catch (error) {
      log.error('get staff member failed', error, {
        operation: 'get_staff_member',
        practiceId,
        staffId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });
      throw error;
    }
  }

  async createStaffMember(practiceId: string, data: CreateStaffData): Promise<StaffMember> {
    const startTime = Date.now();

    try {
      // Check permission
      if (!this.canManageStaff) {
        throw AuthorizationError('You do not have permission to manage staff');
      }

      // Verify practice access
      await verifyPracticeAccess(practiceId, this.userContext);

      // Get max display_order for this practice with performance tracking
      const maxOrderStart = Date.now();
      const [maxOrder] = await db
        .select({ maxOrder: sql<number>`COALESCE(MAX(${staff_members.display_order}), 0)` })
        .from(staff_members)
        .where(eq(staff_members.practice_id, practiceId));
      const maxOrderDuration = Date.now() - maxOrderStart;

      // Prepare data for insert
      const insertData = {
        practice_id: practiceId,
        name: data.name,
        title: data.title,
        credentials: data.credentials,
        bio: data.bio || null,
        photo_url: data.photo_url || null,
        email: data.email || null,
        phone: data.phone || null,
        specialties: data.specialties ? JSON.stringify(data.specialties) : null,
        education: data.education ? JSON.stringify(data.education) : null,
        is_active: data.is_active !== undefined ? data.is_active : true,
        display_order: (Number(maxOrder?.maxOrder) || 0) + 1,
      };

      // Create staff member with performance tracking
      const insertStart = Date.now();
      const [newMember] = await db.insert(staff_members).values(insertData).returning();
      const insertDuration = Date.now() - insertStart;

      if (!newMember) {
        throw new Error('Failed to create staff member');
      }

      const parsedMember = this.parseStaffMemberJSON(newMember);
      const duration = Date.now() - startTime;

      // Use logTemplates for structured logging
      const template = logTemplates.crud.create('staff_member', {
        resourceId: newMember.staff_id,
        resourceName: newMember.name,
        userId: this.userContext.user_id,
        organizationId: practiceId,
        duration,
        metadata: {
          maxOrderDuration,
          insertDuration,
          slowMaxOrder: maxOrderDuration > SLOW_THRESHOLDS.DB_QUERY,
          slowInsert: insertDuration > SLOW_THRESHOLDS.DB_QUERY,
          displayOrder: insertData.display_order,
        },
      });

      log.info(template.message, template.context);

      return parsedMember;
    } catch (error) {
      log.error('create staff member failed', error, {
        operation: 'create_staff_member',
        practiceId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });
      throw error;
    }
  }

  async updateStaffMember(
    practiceId: string,
    staffId: string,
    data: UpdateStaffData
  ): Promise<StaffMember> {
    const startTime = Date.now();

    try {
      // Check permission
      if (!this.canManageStaff) {
        throw AuthorizationError('You do not have permission to manage staff');
      }

      // Verify practice access
      await verifyPracticeAccess(practiceId, this.userContext);

      // Verify staff member exists and belongs to practice
      const [existing] = await db
        .select()
        .from(staff_members)
        .where(
          and(
            eq(staff_members.staff_id, staffId),
            eq(staff_members.practice_id, practiceId),
            isNull(staff_members.deleted_at)
          )
        )
        .limit(1);

      if (!existing) {
        throw NotFoundError('Staff member');
      }

      // Prepare update data
      const updateData = {
        ...data,
        specialties: data.specialties ? JSON.stringify(data.specialties) : undefined,
        education: data.education ? JSON.stringify(data.education) : undefined,
        updated_at: new Date(),
      };

      // Calculate changes for audit logging (track only fields in update data)
      const changes = calculateChanges(
        existing as Record<string, unknown>,
        updateData as Record<string, unknown>,
        Object.keys(data) as (keyof typeof existing)[]
      );

      // Update staff member with performance tracking
      const updateStart = Date.now();
      const [updated] = await db
        .update(staff_members)
        .set(updateData)
        .where(and(eq(staff_members.staff_id, staffId), eq(staff_members.practice_id, practiceId)))
        .returning();
      const updateDuration = Date.now() - updateStart;

      if (!updated) {
        throw new Error('Failed to update staff member');
      }

      const parsedMember = this.parseStaffMemberJSON(updated);
      const duration = Date.now() - startTime;

      // Use logTemplates for structured logging with change tracking
      const template = logTemplates.crud.update('staff_member', {
        resourceId: staffId,
        resourceName: updated.name,
        userId: this.userContext.user_id,
        changes,
        duration,
        metadata: {
          practiceId,
          updateDuration,
          slow: updateDuration > SLOW_THRESHOLDS.DB_QUERY,
          fieldsChanged: Object.keys(changes).length,
        },
      });

      log.info(template.message, template.context);

      return parsedMember;
    } catch (error) {
      log.error('update staff member failed', error, {
        operation: 'update_staff_member',
        practiceId,
        staffId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });
      throw error;
    }
  }

  async deleteStaffMember(practiceId: string, staffId: string): Promise<boolean> {
    const startTime = Date.now();

    try {
      // Check permission
      if (!this.canManageStaff) {
        throw AuthorizationError('You do not have permission to manage staff');
      }

      // Verify practice access
      await verifyPracticeAccess(practiceId, this.userContext);

      // Verify staff member exists
      const [existing] = await db
        .select()
        .from(staff_members)
        .where(
          and(
            eq(staff_members.staff_id, staffId),
            eq(staff_members.practice_id, practiceId),
            isNull(staff_members.deleted_at)
          )
        )
        .limit(1);

      if (!existing) {
        throw NotFoundError('Staff member');
      }

      // Soft delete with performance tracking
      const deleteStart = Date.now();
      await db
        .update(staff_members)
        .set({
          deleted_at: new Date(),
          updated_at: new Date(),
        })
        .where(and(eq(staff_members.staff_id, staffId), eq(staff_members.practice_id, practiceId)));
      const deleteDuration = Date.now() - deleteStart;

      const duration = Date.now() - startTime;

      // Use logTemplates for structured logging
      const template = logTemplates.crud.delete('staff_member', {
        resourceId: staffId,
        resourceName: existing.name,
        userId: this.userContext.user_id,
        soft: true,
        duration,
        metadata: {
          practiceId,
          deleteDuration,
          slow: deleteDuration > SLOW_THRESHOLDS.DB_QUERY,
        },
      });

      log.info(template.message, template.context);

      return true;
    } catch (error) {
      log.error('delete staff member failed', error, {
        operation: 'delete_staff_member',
        practiceId,
        staffId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });
      throw error;
    }
  }

  async reorderStaff(
    practiceId: string,
    staffOrder: { staff_id: string; display_order: number }[]
  ): Promise<boolean> {
    const startTime = Date.now();

    try {
      // Check permission
      if (!this.canManageStaff) {
        throw AuthorizationError('You do not have permission to manage staff');
      }

      // Verify practice access
      await verifyPracticeAccess(practiceId, this.userContext);

      // Update each staff member's display_order in a transaction
      const txStart = Date.now();
      await db.transaction(async (tx) => {
        for (const item of staffOrder) {
          await tx
            .update(staff_members)
            .set({
              display_order: item.display_order,
              updated_at: new Date(),
            })
            .where(
              and(
                eq(staff_members.staff_id, item.staff_id),
                eq(staff_members.practice_id, practiceId)
              )
            );
        }
      });
      const txDuration = Date.now() - txStart;

      const duration = Date.now() - startTime;

      // Log reorder operation
      log.info('staff reordered successfully', {
        operation: 'reorder_staff',
        practiceId,
        userId: this.userContext.user_id,
        staffCount: staffOrder.length,
        duration,
        component: 'service',
        metadata: {
          txDuration,
          slow: txDuration > SLOW_THRESHOLDS.DB_QUERY,
        },
      });

      return true;
    } catch (error) {
      log.error('reorder staff failed', error, {
        operation: 'reorder_staff',
        practiceId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });
      throw error;
    }
  }
}

/**
 * Create an RBAC-enabled staff members service instance
 *
 * Handles all staff member operations with automatic permission enforcement.
 * Provides full CRUD operations plus bulk reordering with pagination, filtering, and sorting.
 *
 * @param userContext - The authenticated user context with permissions
 * @returns Service interface with all staff management methods
 *
 * @example
 * ```typescript
 * const staffService = createRBACStaffMembersService(userContext);
 * const { staff, total } = await staffService.getStaffMembers(practiceId, { limit: 10 });
 * const newStaff = await staffService.createStaffMember(practiceId, staffData);
 * ```
 *
 * Permissions required:
 * - Read: Automatic (practice owner or super admin)
 * - Create/Update/Delete/Reorder: practices:staff:manage:own or practices:manage:all
 *
 * Features:
 * - Automatic display_order calculation on create
 * - JSON parsing for specialties and education fields
 * - Soft delete support
 * - Transaction-based bulk reordering
 * - Pagination and filtering support
 */
export function createRBACStaffMembersService(
  userContext: UserContext
): StaffMembersServiceInterface {
  return new StaffMembersService(userContext);
}
