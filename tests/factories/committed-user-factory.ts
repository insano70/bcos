import type { InferSelectModel } from 'drizzle-orm';
import { inArray } from 'drizzle-orm';
import { hashPassword } from '@/lib/auth/security';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { generateUniqueEmail } from '@/tests/helpers/unique-generator';

export type CommittedUser = InferSelectModel<typeof users>;

/**
 * Configuration options for creating committed test users
 */
export interface CreateCommittedUserOptions {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  emailVerified?: boolean;
  isActive?: boolean;
}

/**
 * Create a test user with COMMITTED transaction
 *
 * IMPORTANT: This creates a user in a COMMITTED transaction so it's visible
 * to services that use the global db connection. The user will persist in the
 * test database and MUST be cleaned up.
 *
 * Use this factory when testing services that need to see users (e.g., foreign key constraints).
 */
export async function createCommittedUser(
  options: CreateCommittedUserOptions = {}
): Promise<CommittedUser> {
  const userData = {
    email: options.email || generateUniqueEmail(),
    password_hash: await hashPassword(options.password || 'TestPassword123!'),
    first_name: options.firstName || 'Test',
    last_name: options.lastName || 'User',
    email_verified: options.emailVerified ?? false,
    is_active: options.isActive ?? true,
  };

  const [user] = await db.insert(users).values(userData).returning();
  if (!user) {
    throw new Error('Failed to create committed test user');
  }
  return user;
}

/**
 * Cleanup function to delete users created by tests
 * Call this in test cleanup to ensure no test data persists
 */
export async function deleteCommittedUsers(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;

  await db.delete(users).where(inArray(users.user_id, userIds));
}
