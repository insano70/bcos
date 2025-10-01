/**
 * Committed RBAC Helper Functions
 *
 * Helper functions for RBAC operations that work with committed transactions.
 * These functions use the global db connection instead of test transactions.
 */

import { db } from '@/lib/db'
import { user_organizations } from '@/lib/db/rbac-schema'
import type { UserOrganization, Organization } from '@/lib/types/rbac'
import type { CommittedUser } from '@/tests/factories/committed'

/**
 * Assign a user to an organization (committed version)
 * Creates the user_organization relationship using global db
 */
export async function assignUserToOrganization(
  user: CommittedUser,
  organization: Organization
): Promise<UserOrganization> {
  const [userOrg] = await db
    .insert(user_organizations)
    .values({
      user_id: user.user_id,
      organization_id: organization.organization_id,
    })
    .returning()

  if (!userOrg) {
    throw new Error('Failed to assign user to organization')
  }

  // Map null values to undefined for TypeScript interface compatibility
  return {
    user_organization_id: userOrg.user_organization_id,
    user_id: userOrg.user_id,
    organization_id: userOrg.organization_id,
    is_active: userOrg.is_active || false,
    joined_at: userOrg.joined_at || new Date(),
    created_at: userOrg.created_at || new Date(),
  }
}
