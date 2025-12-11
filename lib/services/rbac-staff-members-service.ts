import { and, eq, isNull, like, sql, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db';
import { staff_members } from '@/lib/db/schema';
import { DatabaseError, ForbiddenError, NotFoundError } from '@/lib/errors/domain-errors';
import { calculateChanges, log, logTemplates, SLOW_THRESHOLDS } from '@/lib/logger';
import {
  BaseCrudService,
  type BaseQueryOptions,
  type CrudServiceConfig,
} from '@/lib/services/crud';
import type { UserContext } from '@/lib/types/rbac';
import { parseEducation, parseSpecialties } from '@/lib/utils/safe-json';
import { verifyPracticeAccess } from './rbac-practice-utils';

/**
 * RBAC Staff Members Service
 * Manages practice staff CRUD operations with automatic permission checking
 *
 * Migrated to use BaseCrudService infrastructure.
 */

/**
 * Education entry for a staff member
 */
export interface StaffEducation {
  degree: string;
  school: string;
  year: string;
}

/**
 * Staff member entity with properly typed fields
 */
export interface StaffMember {
  staff_id: string;
  practice_id: string | null;
  name: string;
  title: string | null;
  credentials: string | null;
  bio: string | null;
  photo_url: string | null;
  email: string | null;
  phone: string | null;
  specialties: string[];
  education: StaffEducation[];
  is_active: boolean;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface StaffQueryOptions extends BaseQueryOptions {
  practice_id: string;
  is_active?: boolean | undefined;
  // Legacy API compatibility
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
  specialties?: string[] | undefined;
  education?: StaffEducation[] | undefined;
  is_active?: boolean | undefined;
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
  specialties?: string[] | undefined;
  education?: StaffEducation[] | undefined;
  is_active?: boolean | undefined;
  display_order?: number | undefined;
}

export class RBACStaffMembersService extends BaseCrudService<
  typeof staff_members,
  StaffMember,
  CreateStaffData,
  UpdateStaffData,
  StaffQueryOptions
> {
  private readonly canManageStaff: boolean;

  constructor(userContext: UserContext) {
    super(userContext);
    // Cache permission check once in constructor
    this.canManageStaff =
      userContext.is_super_admin ||
      userContext.all_permissions?.some(
        (p) => p.name === 'practices:staff:manage:own' || p.name === 'practices:manage:all'
      ) ||
      false;
  }

  protected config: CrudServiceConfig<
    typeof staff_members,
    StaffMember,
    CreateStaffData,
    UpdateStaffData,
    StaffQueryOptions
  > = {
    table: staff_members,
    resourceName: 'staff-members',
    displayName: 'staff member',
    primaryKeyName: 'staff_id',
    deletedAtColumnName: 'deleted_at',
    updatedAtColumnName: 'updated_at',
    permissions: {
      // Staff access uses practice-based access control:
      // 1. Base class checks 'practices:read:own' permission (practice owners have this)
      // 2. validateParentAccess() verifies user owns the specific practice
      // This two-level check ensures only practice owners can access their staff.
      read: 'practices:read:own',
      // Create/update/delete are handled by custom methods that check canManageStaff
      // permission which requires 'practices:staff:manage:own' or 'practices:manage:all'
    },
    transformers: {
      toEntity: (row: Record<string, unknown>): StaffMember => ({
        staff_id: row.staff_id as string,
        practice_id: row.practice_id as string | null,
        name: row.name as string,
        title: row.title as string | null,
        credentials: row.credentials as string | null,
        bio: row.bio as string | null,
        photo_url: row.photo_url as string | null,
        email: row.email as string | null,
        phone: row.phone as string | null,
        specialties: parseSpecialties(row.specialties as string | null) as string[],
        education: parseEducation(row.education as string | null) as StaffEducation[],
        is_active: (row.is_active as boolean) ?? true,
        display_order: (row.display_order as number) ?? 0,
        created_at: (row.created_at as Date) ?? new Date(),
        updated_at: (row.updated_at as Date) ?? new Date(),
      }),
    },
  };

  /**
   * Build custom conditions for practice_id and is_active filtering
   */
  protected buildCustomConditions(options: StaffQueryOptions): SQL[] {
    const conditions: SQL[] = [];

    // Always filter by practice_id (required)
    conditions.push(eq(staff_members.practice_id, options.practice_id));

    if (options.is_active !== undefined) {
      conditions.push(eq(staff_members.is_active, options.is_active));
    }

    if (options.search) {
      conditions.push(like(staff_members.name, `%${options.search}%`));
    }

    return conditions;
  }

  /**
   * Validate parent practice access before listing staff
   */
  protected async validateParentAccess(options: StaffQueryOptions): Promise<void> {
    await verifyPracticeAccess(options.practice_id, this.userContext);
  }

  // ===========================================================================
  // Public API Methods - Maintain backward compatibility
  // ===========================================================================

  /**
   * Get staff members for a practice with filtering and pagination.
   *
   * Logging is handled by BaseCrudService.getList() and getCount().
   *
   * @param practiceId - The practice ID to get staff for
   * @param options - Query options (is_active, search, limit, offset, sortBy, sortOrder)
   * @returns Object containing staff array and total count for pagination
   * @throws ForbiddenError if user doesn't have access to the practice
   */
  async getStaffMembers(
    practiceId: string,
    options: Omit<StaffQueryOptions, 'practice_id'> = {}
  ): Promise<{ staff: StaffMember[]; total: number }> {
    // Verify practice access
    await verifyPracticeAccess(practiceId, this.userContext);

    // Map legacy sortBy/sortOrder to standard sortField/sortOrder for SQL ordering
    const sortField = options.sortBy || 'display_order';
    const sortOrder = options.sortOrder || 'asc';

    // Get total count (logging handled by base class)
    const total = await this.getCount({ ...options, practice_id: practiceId });

    // Get paginated data with SQL sorting (logging handled by base class)
    const result = await this.getList({
      ...options,
      practice_id: practiceId,
      sortField,
      sortOrder,
      limit: options.limit ?? 100,
      offset: options.offset ?? 0,
    });

    return { staff: result.items, total };
  }

  /**
   * Get a single staff member by ID.
   *
   * Base class getById() handles logging.
   *
   * @param practiceId - The practice ID the staff member belongs to
   * @param staffId - The staff member ID to retrieve
   * @returns The staff member entity
   * @throws NotFoundError if staff member not found or doesn't belong to practice
   * @throws ForbiddenError if user doesn't have access to the practice
   */
  async getStaffMember(practiceId: string, staffId: string): Promise<StaffMember> {
    // Verify practice access
    await verifyPracticeAccess(practiceId, this.userContext);

    // Get staff member (logging handled by base class)
    const member = await this.getById(staffId);

    if (!member) {
      throw new NotFoundError('Staff member', staffId);
    }

    // Verify staff belongs to this practice
    if (member.practice_id !== practiceId) {
      throw new NotFoundError('Staff member', staffId);
    }

    return member;
  }

  /**
   * Create a new staff member for a practice.
   *
   * Custom implementation handles auto-incrementing display_order and JSON serialization.
   *
   * @param practiceId - The practice ID to create the staff member for
   * @param data - The staff member data (name, title, credentials, etc.)
   * @returns The created staff member entity
   * @throws ForbiddenError if user doesn't have permission to manage staff
   * @throws DatabaseError if creation fails
   */
  async createStaffMember(practiceId: string, data: CreateStaffData): Promise<StaffMember> {
    const startTime = Date.now();

    // Check permission
    if (!this.canManageStaff) {
      throw new ForbiddenError('You do not have permission to manage staff');
    }

    // Verify practice access
    await verifyPracticeAccess(practiceId, this.userContext);

    // Get max display_order for this practice
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
      title: data.title ?? null,
      credentials: data.credentials ?? null,
      bio: data.bio ?? null,
      photo_url: data.photo_url ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      specialties: data.specialties ? JSON.stringify(data.specialties) : null,
      education: data.education ? JSON.stringify(data.education) : null,
      is_active: data.is_active ?? true,
      display_order: data.display_order ?? (Number(maxOrder?.maxOrder) || 0) + 1,
    };

    // Create staff member
    const insertStart = Date.now();
    const [newMember] = await db.insert(staff_members).values(insertData).returning();
    const insertDuration = Date.now() - insertStart;

    if (!newMember) {
      throw new DatabaseError('Failed to create staff member', 'write');
    }

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

    // Return with parsed JSON fields
    return this.config.transformers?.toEntity?.(
      newMember as unknown as Record<string, unknown>
    ) as StaffMember;
  }

  /**
   * Update an existing staff member.
   *
   * Custom implementation handles JSON serialization for specialties and education.
   *
   * @param practiceId - The practice ID the staff member belongs to
   * @param staffId - The staff member ID to update
   * @param data - The update data (partial, only provided fields are updated)
   * @returns The updated staff member entity
   * @throws ForbiddenError if user doesn't have permission to manage staff
   * @throws NotFoundError if staff member not found
   * @throws DatabaseError if update fails
   */
  async updateStaffMember(
    practiceId: string,
    staffId: string,
    data: UpdateStaffData
  ): Promise<StaffMember> {
    const startTime = Date.now();

    // Check permission
    if (!this.canManageStaff) {
      throw new ForbiddenError('You do not have permission to manage staff');
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
      throw new NotFoundError('Staff member', staffId);
    }

    // Prepare update data
    const updateData = {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.title !== undefined && { title: data.title }),
      ...(data.credentials !== undefined && { credentials: data.credentials }),
      ...(data.bio !== undefined && { bio: data.bio }),
      ...(data.photo_url !== undefined && { photo_url: data.photo_url }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.specialties !== undefined && { specialties: JSON.stringify(data.specialties) }),
      ...(data.education !== undefined && { education: JSON.stringify(data.education) }),
      ...(data.is_active !== undefined && { is_active: data.is_active }),
      ...(data.display_order !== undefined && { display_order: data.display_order }),
      updated_at: new Date(),
    };

    // Calculate changes for audit logging
    const changes = calculateChanges(
      existing as unknown as Record<string, unknown>,
      data as unknown as Record<string, unknown>,
      Object.keys(data)
    );

    // Update staff member
    const updateStart = Date.now();
    const [updated] = await db
      .update(staff_members)
      .set(updateData)
      .where(and(eq(staff_members.staff_id, staffId), eq(staff_members.practice_id, practiceId)))
      .returning();
    const updateDuration = Date.now() - updateStart;

    if (!updated) {
      throw new DatabaseError('Failed to update staff member', 'write');
    }

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

    // Return with parsed JSON fields
    return this.config.transformers?.toEntity?.(
      updated as unknown as Record<string, unknown>
    ) as StaffMember;
  }

  /**
   * Delete a staff member (soft delete).
   *
   * Sets deleted_at timestamp rather than permanently removing the record.
   *
   * @param practiceId - The practice ID the staff member belongs to
   * @param staffId - The staff member ID to delete
   * @returns true if deleted successfully
   * @throws ForbiddenError if user doesn't have permission to manage staff
   * @throws NotFoundError if staff member not found
   */
  async deleteStaffMember(practiceId: string, staffId: string): Promise<boolean> {
    const startTime = Date.now();

    // Check permission
    if (!this.canManageStaff) {
      throw new ForbiddenError('You do not have permission to manage staff');
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
      throw new NotFoundError('Staff member', staffId);
    }

    // Soft delete
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
  }

  /**
   * Bulk reorder staff members within a practice.
   *
   * Updates display_order for multiple staff members in a single transaction.
   *
   * @param practiceId - The practice ID containing the staff members
   * @param staffOrder - Array of { staff_id, display_order } pairs defining the new order
   * @returns true if reorder completed successfully
   * @throws ForbiddenError if user doesn't have permission to manage staff
   */
  async reorderStaff(
    practiceId: string,
    staffOrder: { staff_id: string; display_order: number }[]
  ): Promise<boolean> {
    const startTime = Date.now();

    // Check permission
    if (!this.canManageStaff) {
      throw new ForbiddenError('You do not have permission to manage staff');
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
            and(eq(staff_members.staff_id, item.staff_id), eq(staff_members.practice_id, practiceId))
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
  }
}

/**
 * Factory function to create RBACStaffMembersService
 */
export function createRBACStaffMembersService(userContext: UserContext): RBACStaffMembersService {
  return new RBACStaffMembersService(userContext);
}
