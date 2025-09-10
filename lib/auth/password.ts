import bcrypt from 'bcrypt';

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
    console.error('Password verification error:', error);
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
