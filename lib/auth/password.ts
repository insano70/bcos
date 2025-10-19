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
