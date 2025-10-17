import { randomBytes } from 'node:crypto';

/**
 * Generate a cryptographically secure unique identifier
 * Uses crypto.randomBytes for collision resistance and parallel test support
 */
export function generateCryptoUniqueId(prefix = 'test'): string {
  // Generate 8 random bytes (64 bits) for high collision resistance
  const randomPart = randomBytes(8).toString('hex');
  // Add timestamp for additional uniqueness and debugging
  const timestamp = Date.now();
  return `${prefix}_${timestamp}_${randomPart}`;
}

/**
 * Generate a unique email address for test users
 * Uses crypto random bytes to prevent collisions in parallel test runs
 */
export function generateUniqueEmail(prefix = 'test'): string {
  return `${generateCryptoUniqueId(prefix)}@test.local`;
}

/**
 * Generate a unique username for test users
 * Uses crypto random bytes to prevent collisions in parallel test runs
 */
export function generateUniqueUsername(prefix = 'user'): string {
  return generateCryptoUniqueId(prefix);
}

/**
 * Generate a unique organization name for test organizations
 * Uses crypto random bytes to prevent collisions in parallel test runs
 */
export function generateUniqueOrgName(prefix = 'org'): string {
  return generateCryptoUniqueId(prefix);
}

/**
 * Generate a unique practice name for test practices
 * Uses crypto random bytes to prevent collisions in parallel test runs
 */
export function generateUniquePracticeName(prefix = 'practice'): string {
  return generateCryptoUniqueId(prefix);
}

/**
 * Generate a unique practice domain for test practices
 * Uses crypto random bytes to prevent collisions in parallel test runs
 */
export function generateUniqueDomain(prefix = 'testpractice'): string {
  return `${generateCryptoUniqueId(prefix)}.local`;
}

/**
 * Generate a unique staff name for test staff members
 * Uses crypto random bytes to prevent collisions in parallel test runs
 */
export function generateUniqueStaffName(prefix = 'staff'): string {
  return generateCryptoUniqueId(prefix);
}

/**
 * Generate a unique role name for test roles
 * Uses crypto random bytes to prevent collisions in parallel test runs
 */
export function generateUniqueRoleName(prefix = 'role'): string {
  return generateCryptoUniqueId(prefix);
}
