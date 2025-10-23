import { and, eq, isNull } from 'drizzle-orm';
import { AuthorizationError, NotFoundError } from '@/lib/api/responses/error';
import { db, practices } from '@/lib/db';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

/**
 * RBAC Practice Utilities
 * Shared utility functions for practice access verification
 * Used across multiple practice-related services to maintain DRY principle
 */

/**
 * Verify that a practice exists and the user has permission to access it
 *
 * @param practiceId - The UUID of the practice to verify
 * @param userContext - The user context containing permissions and identity
 * @throws {NotFoundError} If the practice does not exist or has been deleted
 * @throws {AuthorizationError} If the user does not have permission to access the practice
 *
 * @example
 * ```typescript
 * await verifyPracticeAccess(practiceId, userContext);
 * // If successful, continue with operation
 * // If unauthorized, an AuthorizationError is thrown
 * ```
 */
export async function verifyPracticeAccess(
  practiceId: string,
  userContext: UserContext
): Promise<void> {
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

    // Debug logging for access check
    log.info('Practice access check', {
      practiceId,
      userId: userContext.user_id,
      isSuperAdmin: userContext.is_super_admin,
      isOwner,
      ownerUserId: practice.owner_user_id,
      hasRoles: userContext.roles?.length || 0,
      roleNames: userContext.roles?.map(r => r.name),
      component: 'rbac',
    });

    if (!userContext.is_super_admin && !isOwner) {
      throw AuthorizationError('You do not have permission to access this practice');
    }

    log.debug('Practice access verified', {
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
