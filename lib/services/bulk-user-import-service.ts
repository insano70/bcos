import { and, eq, inArray, isNull } from 'drizzle-orm';
import { ensureSecurityRecord, hashPassword } from '@/lib/auth/security';
import { db, organizations, roles, user_organizations, users } from '@/lib/db';
import { user_roles } from '@/lib/db/rbac-schema';
import { log, logTemplates, SLOW_THRESHOLDS } from '@/lib/logger';
import { invalidateUserContext } from '@/lib/rbac/cache-invalidation';
import type { UserContext } from '@/lib/types/rbac';
import {
  csvRowSchema,
  type BulkImportCommitRow,
  type RawCSVRow,
  type ResolvedCSVRow,
  type UserCreationResult,
  type ValidatedCSVRow,
} from '@/lib/validations/bulk-import';
import { parseRoles } from '@/lib/utils/csv-import';

/**
 * Bulk User Import Service
 *
 * Handles validation and creation of users from CSV import data.
 * Supports partial success - creates valid users while reporting failures.
 *
 * **Features**:
 * - Organization name resolution (exact match)
 * - Role name resolution (exact match)
 * - Email uniqueness checking
 * - Field validation with detailed error messages
 * - Password hashing with bcrypt
 * - Account security record creation
 * - RBAC cache invalidation
 *
 * @example
 * ```typescript
 * const service = createBulkUserImportService(userContext);
 *
 * // Validate CSV rows
 * const validatedRows = await service.validateRows(csvRows);
 *
 * // Create users from validated data
 * const results = await service.createUsers(validatedRows);
 * ```
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Bulk User Import Service Interface
 */
export interface BulkUserImportServiceInterface {
  validateRows(csvRows: RawCSVRow[]): Promise<ResolvedCSVRow[]>;
  createUsers(rows: BulkImportCommitRow[]): Promise<UserCreationResult[]>;
}

// ============================================================================
// Service Implementation
// ============================================================================

class BulkUserImportService implements BulkUserImportServiceInterface {
  private readonly isSuperAdmin: boolean;
  private readonly accessibleOrganizationIds: string[];

  constructor(private readonly userContext: UserContext) {
    this.isSuperAdmin = userContext.is_super_admin || false;
    this.accessibleOrganizationIds =
      userContext.accessible_organizations?.map((org) => org.organization_id) || [];
  }

  /**
   * Validate CSV rows and resolve organization/role names to IDs
   *
   * Performs:
   * - Field-level validation (Zod schemas)
   * - Organization name resolution
   * - Role name resolution
   * - Email uniqueness checking (both in DB and within CSV)
   *
   * @param csvRows - Raw CSV rows from parsing
   * @returns Array of resolved rows with validation status
   */
  async validateRows(csvRows: RawCSVRow[]): Promise<ResolvedCSVRow[]> {
    const startTime = Date.now();

    try {
      // Pre-fetch all organizations and roles user has access to
      const [accessibleOrgs, accessibleRoles, existingEmails] = await Promise.all([
        this.getAccessibleOrganizations(),
        this.getAccessibleRoles(),
        this.getExistingEmails(csvRows.map((r) => r.email?.toLowerCase().trim()).filter(Boolean)),
      ]);

      // Build lookup maps for efficient resolution
      const orgByName = new Map(accessibleOrgs.map((o) => [o.name.toLowerCase(), o]));
      const roleByName = new Map(accessibleRoles.map((r) => [r.name.toLowerCase(), r]));
      const existingEmailSet = new Set(existingEmails.map((e) => e.toLowerCase()));

      // Track emails seen in this CSV for duplicate detection
      const seenEmailsInCSV = new Set<string>();

      const results: ResolvedCSVRow[] = [];

      for (let i = 0; i < csvRows.length; i++) {
        const row = csvRows[i];
        if (!row) continue;

        const rowNumber = i + 1; // 1-indexed for user display
        const errors: string[] = [];

        // 1. Field-level validation
        const fieldValidation = csvRowSchema.safeParse(row);
        let validatedData: ValidatedCSVRow | null = null;

        if (!fieldValidation.success) {
          // Extract field errors
          for (const issue of fieldValidation.error.issues) {
            const field = issue.path.join('.');
            errors.push(`${field}: ${issue.message}`);
          }
        } else {
          validatedData = {
            first_name: fieldValidation.data.first_name,
            last_name: fieldValidation.data.last_name,
            email: fieldValidation.data.email,
            organization_name: fieldValidation.data.organization,
            password: fieldValidation.data.password,
            roles: fieldValidation.data.roles,
            provider_uid: fieldValidation.data.provider_uid,
          };
        }

        // 2. Check for duplicate email in CSV
        const normalizedEmail = row.email?.toLowerCase().trim() || '';
        if (normalizedEmail && seenEmailsInCSV.has(normalizedEmail)) {
          errors.push('Duplicate email in CSV file');
        }
        seenEmailsInCSV.add(normalizedEmail);

        // 3. Check if email already exists in database
        if (normalizedEmail && existingEmailSet.has(normalizedEmail)) {
          errors.push('Email already exists in the system');
        }

        // 4. Resolve organization
        const orgName = row.organization?.trim() || '';
        const resolvedOrg = orgByName.get(orgName.toLowerCase());
        let organizationId: string | null = null;

        if (!resolvedOrg) {
          if (orgName) {
            errors.push(`Organization '${orgName}' not found or not accessible`);
          }
        } else {
          organizationId = resolvedOrg.organization_id;
        }

        // 5. Resolve roles
        const roleNames = parseRoles(row.roles || '');
        const roleIds: string[] = [];
        const resolvedRoleNames: string[] = [];

        for (const roleName of roleNames) {
          const resolvedRole = roleByName.get(roleName.toLowerCase());
          if (resolvedRole) {
            roleIds.push(resolvedRole.role_id);
            resolvedRoleNames.push(resolvedRole.name);
          } else {
            errors.push(`Role '${roleName}' not found`);
          }
        }

        if (roleNames.length > 0 && roleIds.length === 0) {
          // All roles were invalid - already added individual errors
        } else if (roleNames.length === 0 && row.roles?.trim()) {
          errors.push('At least one valid role is required');
        }

        // Build result row
        results.push({
          row_number: rowNumber,
          data: {
            first_name: validatedData?.first_name || row.first_name || '',
            last_name: validatedData?.last_name || row.last_name || '',
            email: validatedData?.email || normalizedEmail,
            organization_name: orgName,
            organization_id: organizationId,
            roles: resolvedRoleNames.length > 0 ? resolvedRoleNames : roleNames,
            role_ids: roleIds,
            provider_uid: validatedData?.provider_uid ?? null,
          },
          is_valid: errors.length === 0 && organizationId !== null && roleIds.length > 0,
          errors,
        });
      }

      const duration = Date.now() - startTime;
      const validCount = results.filter((r) => r.is_valid).length;
      const invalidCount = results.filter((r) => !r.is_valid).length;

      log.info('bulk import rows validated', {
        operation: 'validate_bulk_import_rows',
        userId: this.userContext.user_id,
        duration,
        metadata: {
          totalRows: csvRows.length,
          validRows: validCount,
          invalidRows: invalidCount,
          slow: duration > SLOW_THRESHOLDS.API_OPERATION,
          component: 'service',
        },
      });

      return results;
    } catch (error) {
      log.error('bulk import validation failed', error, {
        operation: 'validate_bulk_import_rows',
        userId: this.userContext.user_id,
        rowCount: csvRows.length,
        component: 'service',
      });
      throw error;
    }
  }

  /**
   * Create users from validated import data
   *
   * Processes each row independently - partial success is allowed.
   * Each user creation includes:
   * - Password hashing
   * - User record creation
   * - Account security record creation
   * - Organization assignment
   * - Role assignment
   * - RBAC cache invalidation
   *
   * @param rows - Validated and resolved rows ready for creation
   * @returns Array of creation results with success/failure per row
   */
  async createUsers(rows: BulkImportCommitRow[]): Promise<UserCreationResult[]> {
    const startTime = Date.now();
    const results: UserCreationResult[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      const rowNumber = i + 1;

      try {
        // Create user within a transaction for atomicity per row
        const userId = await db.transaction(async (tx) => {
          // Hash password
          const passwordHash = await hashPassword(row.password);

          // Create user record
          const [newUser] = await tx
            .insert(users)
            .values({
              email: row.email,
              password_hash: passwordHash,
              first_name: row.first_name,
              last_name: row.last_name,
              email_verified: true, // Admin-imported users are trusted
              is_active: true,
              ...(row.provider_uid !== null &&
                row.provider_uid !== undefined && { provider_uid: row.provider_uid }),
            })
            .returning({ user_id: users.user_id });

          if (!newUser) {
            throw new Error('Failed to create user record');
          }

          // Add to organization
          await tx.insert(user_organizations).values({
            user_id: newUser.user_id,
            organization_id: row.organization_id,
            is_active: true,
          });

          // Assign roles
          if (row.role_ids.length > 0) {
            const roleAssignments = row.role_ids.map((roleId) => ({
              user_id: newUser.user_id,
              role_id: roleId,
              organization_id: row.organization_id,
              granted_by: this.userContext.user_id,
              is_active: true,
            }));

            await tx.insert(user_roles).values(roleAssignments);
          }

          return newUser.user_id;
        });

        // Create account_security record (outside transaction - idempotent)
        await ensureSecurityRecord(userId);

        // Invalidate user context cache
        await invalidateUserContext(userId);

        results.push({
          row_number: rowNumber,
          email: row.email,
          success: true,
          user_id: userId,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error during user creation';

        // Check for specific constraint violations
        let displayError = errorMessage;
        if (errorMessage.includes('unique constraint') && errorMessage.includes('email')) {
          displayError = 'Email already exists';
        } else if (errorMessage.includes('foreign key constraint')) {
          displayError = 'Invalid organization or role reference';
        }

        results.push({
          row_number: rowNumber,
          email: row.email,
          success: false,
          error: displayError,
        });

        log.error('bulk import user creation failed', error, {
          operation: 'create_bulk_import_user',
          userId: this.userContext.user_id,
          rowNumber,
          targetEmail: row.email,
          component: 'service',
        });
      }
    }

    const duration = Date.now() - startTime;
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    const template = logTemplates.crud.create('bulk_users', {
      resourceId: 'bulk-import',
      resourceName: `${successCount} users`,
      userId: this.userContext.user_id,
      duration,
      metadata: {
        totalRows: rows.length,
        successCount,
        failureCount,
        slow: duration > SLOW_THRESHOLDS.API_OPERATION,
        component: 'service',
      },
    });

    log.info(template.message, template.context);

    return results;
  }

  /**
   * Get organizations accessible to the current user
   * Returns organizations the user can create users in
   */
  private async getAccessibleOrganizations(): Promise<
    Array<{ organization_id: string; name: string }>
  > {
    const queryStart = Date.now();

    const whereConditions = [eq(organizations.is_active, true), isNull(organizations.deleted_at)];

    // If not super admin, filter to accessible organizations
    if (!this.isSuperAdmin && this.accessibleOrganizationIds.length > 0) {
      whereConditions.push(inArray(organizations.organization_id, this.accessibleOrganizationIds));
    } else if (!this.isSuperAdmin && this.accessibleOrganizationIds.length === 0) {
      // No accessible organizations
      return [];
    }

    const results = await db
      .select({
        organization_id: organizations.organization_id,
        name: organizations.name,
      })
      .from(organizations)
      .where(and(...whereConditions));

    const queryDuration = Date.now() - queryStart;

    if (queryDuration > SLOW_THRESHOLDS.DB_QUERY) {
      log.info('slow query: get accessible organizations', {
        operation: 'get_accessible_organizations',
        duration: queryDuration,
        resultCount: results.length,
        component: 'service',
      });
    }

    return results;
  }

  /**
   * Get roles accessible to the current user
   * Returns both system roles and organization-scoped roles
   */
  private async getAccessibleRoles(): Promise<Array<{ role_id: string; name: string }>> {
    const queryStart = Date.now();

    // Get system roles (always accessible) and organization-scoped roles
    const whereConditions = [eq(roles.is_active, true)];

    // For non-super admins, only get:
    // 1. System roles (is_system_role = true)
    // 2. Roles scoped to accessible organizations
    // For super admins, get all active roles

    const results = await db
      .select({
        role_id: roles.role_id,
        name: roles.name,
      })
      .from(roles)
      .where(and(...whereConditions));

    const queryDuration = Date.now() - queryStart;

    if (queryDuration > SLOW_THRESHOLDS.DB_QUERY) {
      log.info('slow query: get accessible roles', {
        operation: 'get_accessible_roles',
        duration: queryDuration,
        resultCount: results.length,
        component: 'service',
      });
    }

    return results;
  }

  /**
   * Check which emails already exist in the database
   */
  private async getExistingEmails(emails: string[]): Promise<string[]> {
    if (emails.length === 0) {
      return [];
    }

    const queryStart = Date.now();

    // Normalize emails for lookup
    const normalizedEmails = emails.map((e) => e.toLowerCase());

    const results = await db
      .select({ email: users.email })
      .from(users)
      .where(and(inArray(users.email, normalizedEmails), isNull(users.deleted_at)));

    const queryDuration = Date.now() - queryStart;

    if (queryDuration > SLOW_THRESHOLDS.DB_QUERY) {
      log.info('slow query: check existing emails', {
        operation: 'check_existing_emails',
        duration: queryDuration,
        emailCount: emails.length,
        foundCount: results.length,
        component: 'service',
      });
    }

    return results.map((r) => r.email);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Factory function to create Bulk User Import Service
 */
export function createBulkUserImportService(
  userContext: UserContext
): BulkUserImportServiceInterface {
  return new BulkUserImportService(userContext);
}
