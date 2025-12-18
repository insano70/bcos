import { eq } from 'drizzle-orm';
import { db, users } from '@/lib/db';
import { validateAccessToken } from './tokens';

/**
 * Updated session utilities for JWT + Refresh Token strategy
 * Replaces NextAuth session management with token-based approach
 */

/**
 * Retrieves the current user from a valid access token
 *
 * Validates the access token, extracts the user ID from the payload,
 * and fetches the full user record from the database.
 *
 * @param accessToken - The JWT access token to validate and extract user from
 * @returns User object with profile data, or null if token is invalid or user not found/inactive
 */
export async function getCurrentUserFromToken(accessToken: string) {
  try {
    const payload = await validateAccessToken(accessToken);
    if (!payload) return null;

    // Runtime validation of payload structure
    if (typeof payload.sub !== 'string' || !payload.sub) {
      return null;
    }

    const userId = payload.sub;

    const [user] = await db.select().from(users).where(eq(users.user_id, userId)).limit(1);

    if (!user || !user.is_active) return null;

    // Safely extract optional fields with runtime validation
    const role =
      payload.role && typeof payload.role === 'string' ? payload.role : 'user';
    const practiceId =
      payload.practiceId && typeof payload.practiceId === 'string'
        ? payload.practiceId
        : undefined;

    return {
      id: user.user_id,
      email: user.email,
      name: `${user.first_name} ${user.last_name}`,
      firstName: user.first_name,
      lastName: user.last_name,
      role,
      emailVerified: user.email_verified,
      practiceId,
    };
  } catch (_error) {
    return null;
  }
}
