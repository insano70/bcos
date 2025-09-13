import { getCurrentTransaction } from '@/tests/helpers/db-helper'
import { users } from '@/lib/db/schema'
import { generateUniqueEmail, generateUniqueUsername } from '@/tests/helpers/unique-generator'
import { hashPassword } from '@/lib/auth/password'
import type { InferSelectModel } from 'drizzle-orm'

type User = InferSelectModel<typeof users>

/**
 * Configuration options for creating test users
 */
export interface CreateUserOptions {
  email?: string
  username?: string
  password?: string
  firstName?: string
  lastName?: string
  emailVerified?: boolean
  isActive?: boolean
}

/**
 * Create a test user with default test data
 * Uses cryptographically unique identifiers for collision-free parallel testing
 */
export async function createTestUser(options: CreateUserOptions = {}): Promise<User> {
  const tx = getCurrentTransaction()

  const userData = {
    email: options.email || generateUniqueEmail(),
    username: options.username || generateUniqueUsername(),
    password_hash: await hashPassword(options.password || 'TestPassword123!'),
    first_name: options.firstName || 'Test',
    last_name: options.lastName || 'User',
    email_verified: options.emailVerified ?? false,
    is_active: options.isActive ?? true,
  }

  const [user] = await tx.insert(users).values(userData).returning()
  if (!user) {
    throw new Error('Failed to create test user')
  }
  return user
}

/**
 * Create multiple test users in a batch
 * Useful for testing bulk operations or setting up test scenarios
 */
export async function createTestUsers(count: number, baseOptions: CreateUserOptions = {}): Promise<User[]> {
  const users: User[] = []

  for (let i = 0; i < count; i++) {
    const userOptions: CreateUserOptions = {
      ...baseOptions,
    }
    // Ensure each user gets unique identifiers even with base options
    if (baseOptions.email) {
      userOptions.email = `${baseOptions.email.split('@')[0]}_${i}@test.local`
    }
    if (baseOptions.username) {
      userOptions.username = `${baseOptions.username}_${i}`
    }
    const user = await createTestUser(userOptions)
    users.push(user)
  }

  return users
}

/**
 * Create a test user with admin-like properties
 * Useful for testing privileged operations
 */
export async function createTestAdminUser(options: CreateUserOptions = {}): Promise<User> {
  return createTestUser({
    ...options,
    firstName: 'Admin',
    lastName: 'User',
    emailVerified: true,
    isActive: true,
  })
}

/**
 * Create an inactive test user
 * Useful for testing deactivated account scenarios
 */
export async function createInactiveTestUser(options: CreateUserOptions = {}): Promise<User> {
  return createTestUser({
    ...options,
    isActive: false,
  })
}

/**
 * Create a test user with unverified email
 * Useful for testing email verification workflows
 */
export async function createUnverifiedTestUser(options: CreateUserOptions = {}): Promise<User> {
  return createTestUser({
    ...options,
    emailVerified: false,
  })
}
