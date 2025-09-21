import { PermissionChecker } from './permission-checker';
import { db } from '@/lib/db';
import { practices } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { UserContext, PermissionName, PermissionCheckResult } from '@/lib/types/rbac';

/**
 * Server-side Permission Service
 * 
 * Extends the client-safe PermissionChecker with database lookup capabilities.
 * Use this for server-side permission validation that requires database queries.
 * 
 * This service handles:
 * - Practice ownership verification
 * - Other resource ownership checks that require database access
 */
export class ServerPermissionService {
  private checker: PermissionChecker;

  constructor(
    private userContext: UserContext,
    private dbInstance: typeof db = db
  ) {
    this.checker = new PermissionChecker(userContext);
  }

  /**
   * Check permission with full database validation
   * Performs the same checks as PermissionChecker but with database lookups for ownership
   */
  async checkPermission(
    permissionName: string,
    resourceId?: string,
    organizationId?: string
  ): Promise<PermissionCheckResult> {
    // First do the basic permission check
    const basicResult = this.checker.checkPermission(permissionName, { resourceId, organizationId });
    
    // If the basic check failed or if it doesn't involve resource ownership, return as-is
    if (!basicResult.granted || !resourceId || basicResult.scope !== 'own') {
      return basicResult;
    }

    // For 'own' scope permissions with a resourceId, we need to verify ownership
    const [resource] = permissionName.split(':');
    
    if (resource === 'practices') {
      const ownsResource = await this.checkPracticeOwnership(resourceId);
      if (!ownsResource) {
        return {
          granted: false,
          scope: 'own',
          reason: `Access denied: User ${this.userContext.user_id} does not own practice ${resourceId}`
        };
      }
    }

    // If we get here, ownership was verified or not required
    return basicResult;
  }

  /**
   * Check if user has permission with database validation
   */
  async hasPermission(
    permissionName: string,
    resourceId?: string,
    organizationId?: string
  ): Promise<boolean> {
    try {
      const result = await this.checkPermission(permissionName, resourceId, organizationId);
      return result.granted;
    } catch (error) {
      console.warn('Server permission check failed:', {
        userId: this.userContext.user_id,
        permission: permissionName,
        resourceId,
        organizationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Check practice ownership via database query
   */
  private async checkPracticeOwnership(practiceId: string): Promise<boolean> {
    try {
      const practice = await this.dbInstance
        .select({ owner_user_id: practices.owner_user_id })
        .from(practices)
        .where(eq(practices.practice_id, practiceId))
        .limit(1);

      if (practice.length === 0) {
        return false; // Practice doesn't exist
      }

      return practice[0]?.owner_user_id === this.userContext.user_id;
    } catch (error) {
      console.warn('Failed to check practice ownership:', error);
      return false; // Fail safe - deny access on error
    }
  }

  /**
   * Require permission with database validation (throws if denied)
   */
  async requirePermission(
    permissionName: PermissionName,
    resourceId?: string,
    organizationId?: string
  ): Promise<void> {
    const result = await this.checkPermission(permissionName, resourceId, organizationId);
    
    if (!result.granted) {
      const { PermissionDeniedError } = await import('@/lib/types/rbac');
      throw new PermissionDeniedError(permissionName, resourceId, organizationId);
    }
  }

  /**
   * Get the underlying client-safe permission checker
   * Useful when you need client-safe methods
   */
  getClientChecker(): PermissionChecker {
    return this.checker;
  }
}

/**
 * Factory function to create a ServerPermissionService
 */
export function createServerPermissionService(
  userContext: UserContext,
  dbInstance: typeof db = db
): ServerPermissionService {
  return new ServerPermissionService(userContext, dbInstance);
}

/**
 * Utility function to check a permission server-side with database validation
 */
export async function checkServerPermission(
  userContext: UserContext,
  permissionName: string,
  resourceId?: string,
  organizationId?: string,
  dbInstance: typeof db = db
): Promise<boolean> {
  const service = new ServerPermissionService(userContext, dbInstance);
  return await service.hasPermission(permissionName, resourceId, organizationId);
}
