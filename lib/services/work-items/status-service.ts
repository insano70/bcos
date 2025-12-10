// 1. Drizzle ORM
import { and, eq } from 'drizzle-orm';

// 2. Database
import { db } from '@/lib/db';
import { work_item_status_transitions } from '@/lib/db/schema';

// 3. Logging
import { log } from '@/lib/logger';

// 4. Errors
import { ValidationError } from '@/lib/api/responses/error';

// 5. Types
import type { UserContext } from '@/lib/types/rbac';

/**
 * Transition Policy Configuration
 *
 * Defines behavior when no explicit transition rule exists between two statuses.
 *
 * - 'permissive': Allow all transitions that don't have an explicit is_allowed=false rule
 * - 'restrictive': Block all transitions unless explicitly allowed (is_allowed=true)
 *
 * Current default: 'permissive' - matches the original design for flexibility.
 * To change system-wide behavior, update DEFAULT_TRANSITION_POLICY.
 * Future enhancement: Per-work-item-type policy stored in work_item_types table.
 */
type TransitionPolicy = 'permissive' | 'restrictive';
const DEFAULT_TRANSITION_POLICY: TransitionPolicy = 'permissive';

/**
 * Work Item Status Service
 *
 * Handles status transition validation and status-related business logic.
 * Extracted from core-service.ts to separate status management concerns
 * from core CRUD operations.
 *
 * Features:
 * - Status transition validation based on workflow rules
 * - Configurable default policy (see DEFAULT_TRANSITION_POLICY)
 * - Current default: Permissive - allows transitions without explicit rules
 * - Blocks only transitions with explicit is_allowed=false rules
 *
 * @internal - Use factory function instead
 */
class WorkItemStatusService {
  constructor(private readonly userContext: UserContext) {}

  /**
   * Validate status transition is allowed
   *
   * Checks if transition from current status to desired status is permitted
   * based on work_item_status_transitions configuration.
   *
   * Permissive by default: allows transition if no rule exists.
   * Blocks only if explicit rule exists with is_allowed=false.
   *
   * @param typeId - Work item type ID
   * @param fromStatusId - Current status ID
   * @param toStatusId - Desired status ID
   * @throws ValidationError if transition is not allowed
   */
  async validateStatusTransition(
    typeId: string,
    fromStatusId: string,
    toStatusId: string
  ): Promise<void> {
    const queryStart = Date.now();

    try {
      // Check if a transition rule exists for this type and status pair
      const [transition] = await db
        .select({
          work_item_status_transition_id:
            work_item_status_transitions.work_item_status_transition_id,
          is_allowed: work_item_status_transitions.is_allowed,
        })
        .from(work_item_status_transitions)
        .where(
          and(
            eq(work_item_status_transitions.work_item_type_id, typeId),
            eq(work_item_status_transitions.from_status_id, fromStatusId),
            eq(work_item_status_transitions.to_status_id, toStatusId)
          )
        )
        .limit(1);
      const queryDuration = Date.now() - queryStart;

      // If no transition rule exists, behavior depends on the policy
      if (!transition) {
        if (DEFAULT_TRANSITION_POLICY === 'permissive') {
          // Permissive: Allow transition when no rule exists
          log.debug('no transition rule found, allowing status change (permissive policy)', {
            typeId,
            fromStatusId,
            toStatusId,
            policy: DEFAULT_TRANSITION_POLICY,
            queryDuration,
          });
          return;
        } else {
          // Restrictive: Block transition when no rule exists
          log.warn('no transition rule found, blocking status change (restrictive policy)', {
            typeId,
            fromStatusId,
            toStatusId,
            policy: DEFAULT_TRANSITION_POLICY,
            userId: this.userContext.user_id,
            queryDuration,
          });
          throw ValidationError(
            null,
            'Status transition not configured. Contact an administrator to define workflow rules.'
          );
        }
      }

      // If transition rule exists but is_allowed is false, reject the transition
      if (!transition.is_allowed) {
        log.warn('status transition not allowed', {
          typeId,
          fromStatusId,
          toStatusId,
          transitionId: transition.work_item_status_transition_id,
          userId: this.userContext.user_id,
          queryDuration,
        });

        throw ValidationError(
          null,
          'Status transition from current status to selected status is not allowed'
        );
      }

      log.debug('status transition validated successfully', {
        typeId,
        fromStatusId,
        toStatusId,
        transitionId: transition.work_item_status_transition_id,
        queryDuration,
      });
    } catch (error) {
      const duration = Date.now() - queryStart;
      log.error('status transition validation failed', error, {
        typeId,
        fromStatusId,
        toStatusId,
        duration,
      });

      throw error;
    }
  }
}

// ============================================================
// FACTORY
// ============================================================

/**
 * Create Work Item Status Service
 *
 * Factory function to create a new work item status service instance.
 * Provides status transition validation and status-related operations.
 *
 * @param userContext - User context for logging and audit trail
 * @returns Status service instance
 *
 * @example
 * ```typescript
 * const service = createWorkItemStatusService(userContext);
 *
 * // Validate transition
 * await service.validateStatusTransition(
 *   'task-type-uuid',
 *   'in-progress-status-uuid',
 *   'completed-status-uuid'
 * );
 * ```
 */
export function createWorkItemStatusService(userContext: UserContext): WorkItemStatusService {
  return new WorkItemStatusService(userContext);
}
