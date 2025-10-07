import { and, asc, desc, eq, isNull, like, sql } from 'drizzle-orm';
import { AuthorizationError, NotFoundError } from '@/lib/api/responses/error';
import { db, practices, staff_members } from '@/lib/db';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import { parseEducation, parseSpecialties } from '@/lib/utils/safe-json';

/**
 * RBAC Staff Members Service
 * Manages practice staff CRUD operations with automatic permission checking
 */

export interface StaffMember {
  staff_id: string;
  practice_id: string;
  name: string;
  title: string;
  bio?: string | null;
  photo_url?: string | null;
  email?: string | null;
  phone?: string | null;
  specialties?: unknown;
  education?: unknown;
  is_active: boolean;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface StaffFilters {
  is_active?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CreateStaffData {
  name: string;
  title: string;
  bio?: string;
  photo_url?: string;
  email?: string;
  phone?: string;
  specialties?: unknown;
  education?: unknown;
  is_active?: boolean;
}

export interface UpdateStaffData {
  name?: string;
  title?: string;
  bio?: string;
  photo_url?: string;
  email?: string;
  phone?: string;
  specialties?: unknown;
  education?: unknown;
  is_active?: boolean;
  display_order?: number;
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
  // Check permissions once at service creation
  const canManageStaff =
    userContext.is_super_admin ||
    userContext.all_permissions?.some(
      (p) => p.name === 'practices:staff:manage:own' || p.name === 'practices:manage:all'
    );

  /**
   * Verify practice exists and user has access
   */
  async function verifyPracticeAccess(practiceId: string): Promise<void> {
    const startTime = Date.now();

    try {
      const [practice] = await db
        .select()
        .from(practices)
        .where(and(eq(practices.practice_id, practiceId), isNull(practices.deleted_at)))
        .limit(1);

      if (!practice) {
        throw NotFoundError('Practice');
      }

      // Check ownership for non-super-admins
      const isOwner = practice.owner_user_id === userContext.user_id;
      if (!userContext.is_super_admin && !isOwner) {
        throw AuthorizationError('You do not have permission to access this practice');
      }

      log.debug('Practice access verified for staff', {
        practiceId,
        userId: userContext.user_id,
        isOwner,
        duration: Date.now() - startTime,
      });
    } catch (error) {
      log.error('Practice access verification failed', error, {
        practiceId,
        userId: userContext.user_id,
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }

  return {
    async getStaffMembers(
      practiceId: string,
      filters: StaffFilters
    ): Promise<{ staff: StaffMember[]; total: number }> {
      const startTime = Date.now();

      log.info('Get staff members request initiated', {
        requestingUserId: userContext.user_id,
        practiceId,
      });

      try {
        // Verify access
        await verifyPracticeAccess(practiceId);

        // Build where conditions
        const whereConditions = [
          eq(staff_members.practice_id, practiceId),
          isNull(staff_members.deleted_at),
        ];

        if (filters.is_active !== undefined) {
          whereConditions.push(eq(staff_members.is_active, filters.is_active));
        }

        if (filters.search) {
          whereConditions.push(like(staff_members.name, `%${filters.search}%`));
        }

        // Get total count
        const [countResult] = await db
          .select({ count: sql<number>`count(*)` })
          .from(staff_members)
          .where(and(...whereConditions));

        // Get paginated data
        const orderByColumn =
          filters.sortBy === 'name'
            ? staff_members.name
            : filters.sortBy === 'title'
              ? staff_members.title
              : filters.sortBy === 'created_at'
                ? staff_members.created_at
                : staff_members.display_order;

        const staff = await db
          .select()
          .from(staff_members)
          .where(and(...whereConditions))
          .orderBy(filters.sortOrder === 'desc' ? desc(orderByColumn) : asc(orderByColumn))
          .limit(filters.limit || 100)
          .offset(filters.offset || 0);

        // Parse JSON fields
        const parsedStaff = staff.map((member) => ({
          ...member,
          specialties: parseSpecialties(member.specialties),
          education: parseEducation(member.education),
        }));

        log.info('Get staff members completed', {
          practiceId,
          count: staff.length,
          duration: Date.now() - startTime,
        });

        return {
          staff: parsedStaff,
          total: Number(countResult?.count || 0),
        };
      } catch (error) {
        log.error('Get staff members failed', error, {
          practiceId,
          userId: userContext.user_id,
          duration: Date.now() - startTime,
        });
        throw error;
      }
    },

    async getStaffMember(practiceId: string, staffId: string): Promise<StaffMember> {
      const startTime = Date.now();

      log.info('Get staff member request initiated', {
        requestingUserId: userContext.user_id,
        practiceId,
        staffId,
      });

      try {
        // Verify access
        await verifyPracticeAccess(practiceId);

        // Get staff member
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

        if (!member) {
          throw NotFoundError('Staff member');
        }

        // Parse JSON fields
        const parsedMember: StaffMember = {
          ...member,
          specialties: parseSpecialties(member.specialties),
          education: parseEducation(member.education),
        };

        log.info('Get staff member completed', {
          practiceId,
          staffId,
          duration: Date.now() - startTime,
        });

        return parsedMember;
      } catch (error) {
        log.error('Get staff member failed', error, {
          practiceId,
          staffId,
          userId: userContext.user_id,
          duration: Date.now() - startTime,
        });
        throw error;
      }
    },

    async createStaffMember(practiceId: string, data: CreateStaffData): Promise<StaffMember> {
      const startTime = Date.now();

      log.info('Create staff member request initiated', {
        requestingUserId: userContext.user_id,
        practiceId,
      });

      try {
        // Check permission
        if (!canManageStaff) {
          throw AuthorizationError('You do not have permission to manage staff');
        }

        // Verify access
        await verifyPracticeAccess(practiceId);

        // Get max display_order for this practice
        const [maxOrder] = await db
          .select({ maxOrder: sql<number>`COALESCE(MAX(${staff_members.display_order}), 0)` })
          .from(staff_members)
          .where(eq(staff_members.practice_id, practiceId));

        // Prepare data for insert
        const insertData = {
          practice_id: practiceId,
          name: data.name,
          title: data.title,
          bio: data.bio || null,
          photo_url: data.photo_url || null,
          email: data.email || null,
          phone: data.phone || null,
          specialties: data.specialties ? JSON.stringify(data.specialties) : null,
          education: data.education ? JSON.stringify(data.education) : null,
          is_active: data.is_active !== undefined ? data.is_active : true,
          display_order: (Number(maxOrder?.maxOrder) || 0) + 1,
        };

        // Create staff member
        const [newMember] = await db.insert(staff_members).values(insertData).returning();

        if (!newMember) {
          throw new Error('Failed to create staff member');
        }

        // Parse JSON fields
        const parsedMember: StaffMember = {
          ...newMember,
          specialties: parseSpecialties(newMember.specialties),
          education: parseEducation(newMember.education),
        };

        log.info('Create staff member completed', {
          practiceId,
          staffId: newMember.staff_id,
          duration: Date.now() - startTime,
        });

        return parsedMember;
      } catch (error) {
        log.error('Create staff member failed', error, {
          practiceId,
          userId: userContext.user_id,
          duration: Date.now() - startTime,
        });
        throw error;
      }
    },

    async updateStaffMember(
      practiceId: string,
      staffId: string,
      data: UpdateStaffData
    ): Promise<StaffMember> {
      const startTime = Date.now();

      log.info('Update staff member request initiated', {
        requestingUserId: userContext.user_id,
        practiceId,
        staffId,
      });

      try {
        // Check permission
        if (!canManageStaff) {
          throw AuthorizationError('You do not have permission to manage staff');
        }

        // Verify access
        await verifyPracticeAccess(practiceId);

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

        // Update staff member
        const [updated] = await db
          .update(staff_members)
          .set(updateData)
          .where(
            and(eq(staff_members.staff_id, staffId), eq(staff_members.practice_id, practiceId))
          )
          .returning();

        if (!updated) {
          throw new Error('Failed to update staff member');
        }

        // Parse JSON fields
        const parsedMember: StaffMember = {
          ...updated,
          specialties: parseSpecialties(updated.specialties),
          education: parseEducation(updated.education),
        };

        log.info('Update staff member completed', {
          practiceId,
          staffId,
          duration: Date.now() - startTime,
        });

        return parsedMember;
      } catch (error) {
        log.error('Update staff member failed', error, {
          practiceId,
          staffId,
          userId: userContext.user_id,
          duration: Date.now() - startTime,
        });
        throw error;
      }
    },

    async deleteStaffMember(practiceId: string, staffId: string): Promise<boolean> {
      const startTime = Date.now();

      log.info('Delete staff member request initiated', {
        requestingUserId: userContext.user_id,
        practiceId,
        staffId,
      });

      try {
        // Check permission
        if (!canManageStaff) {
          throw AuthorizationError('You do not have permission to manage staff');
        }

        // Verify access
        await verifyPracticeAccess(practiceId);

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

        // Soft delete
        await db
          .update(staff_members)
          .set({
            deleted_at: new Date(),
            updated_at: new Date(),
          })
          .where(
            and(eq(staff_members.staff_id, staffId), eq(staff_members.practice_id, practiceId))
          );

        log.info('Delete staff member completed', {
          practiceId,
          staffId,
          duration: Date.now() - startTime,
        });

        return true;
      } catch (error) {
        log.error('Delete staff member failed', error, {
          practiceId,
          staffId,
          userId: userContext.user_id,
          duration: Date.now() - startTime,
        });
        throw error;
      }
    },

    async reorderStaff(
      practiceId: string,
      staffOrder: { staff_id: string; display_order: number }[]
    ): Promise<boolean> {
      const startTime = Date.now();

      log.info('Reorder staff request initiated', {
        requestingUserId: userContext.user_id,
        practiceId,
        staffCount: staffOrder.length,
      });

      try {
        // Check permission
        if (!canManageStaff) {
          throw AuthorizationError('You do not have permission to manage staff');
        }

        // Verify access
        await verifyPracticeAccess(practiceId);

        // Update each staff member's display_order in a transaction
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

        log.info('Reorder staff completed', {
          practiceId,
          staffCount: staffOrder.length,
          duration: Date.now() - startTime,
        });

        return true;
      } catch (error) {
        log.error('Reorder staff failed', error, {
          practiceId,
          userId: userContext.user_id,
          duration: Date.now() - startTime,
        });
        throw error;
      }
    },
  };
}
