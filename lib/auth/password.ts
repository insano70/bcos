import bcrypt from 'bcrypt';
import { log } from '@/lib/logger';

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

/**
 * Verify a password against its hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    log.error('Password verification error', error, {
      operation: 'verify_password',
      component: 'auth',
    });
    return false;
  }
}

/**
 * Check if a hash needs to be rehashed (for security upgrades)
 */
export function needsRehash(hash: string): boolean {
  // bcrypt hashes start with $2a$, $2b$, $2x$, or $2y$
  return !hash.startsWith('$2');
}
