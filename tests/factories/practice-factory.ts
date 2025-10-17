import type { InferSelectModel } from 'drizzle-orm';
import { practices } from '@/lib/db/schema';
import { getCurrentTransaction } from '@/tests/helpers/db-helper';
import { generateUniqueDomain, generateUniquePracticeName } from '@/tests/helpers/unique-generator';
import type { User } from './user-factory';

type Practice = InferSelectModel<typeof practices>;

/**
 * Configuration options for creating test practices
 */
export interface CreatePracticeOptions {
  name?: string;
  domain?: string;
  templateId?: string;
  status?: 'active' | 'inactive' | 'pending';
  ownerUserId?: string;
}

/**
 * Create a test practice with default test data
 * Uses cryptographically unique identifiers for collision-free parallel testing
 */
export async function createTestPractice(options: CreatePracticeOptions = {}): Promise<Practice> {
  const tx = getCurrentTransaction();

  const practiceData = {
    name: options.name || generateUniquePracticeName(),
    domain: options.domain || generateUniqueDomain(),
    template_id: options.templateId || null,
    status: options.status || 'active',
    owner_user_id: options.ownerUserId || null,
  };

  const [practice] = await tx.insert(practices).values(practiceData).returning();
  if (!practice) {
    throw new Error('Failed to create test practice');
  }
  return practice;
}

/**
 * Create a test practice owned by a specific user
 * Useful for testing practice ownership permissions
 */
export async function createTestPracticeForUser(
  owner: User,
  options: Omit<CreatePracticeOptions, 'ownerUserId'> = {}
): Promise<Practice> {
  return createTestPractice({
    ...options,
    ownerUserId: owner.user_id,
  });
}

/**
 * Create multiple test practices in a batch
 * Useful for testing bulk operations or multiple practice scenarios
 */
export async function createTestPractices(
  count: number,
  baseOptions: CreatePracticeOptions = {}
): Promise<Practice[]> {
  const practices: Practice[] = [];

  for (let i = 0; i < count; i++) {
    const practiceOptions: CreatePracticeOptions = {
      ...baseOptions,
    };
    // Ensure each practice gets unique identifiers
    if (baseOptions.name) {
      practiceOptions.name = `${baseOptions.name}_${i}`;
    }
    if (baseOptions.domain) {
      practiceOptions.domain = `${baseOptions.domain.replace('.local', '')}_${i}.local`;
    }
    const practice = await createTestPractice(practiceOptions);
    practices.push(practice);
  }

  return practices;
}

/**
 * Create an inactive test practice
 * Useful for testing deactivated practice scenarios
 */
export async function createInactiveTestPractice(
  options: CreatePracticeOptions = {}
): Promise<Practice> {
  return createTestPractice({
    ...options,
    status: 'inactive',
  });
}

/**
 * Create a pending test practice
 * Useful for testing practice approval workflows
 */
export async function createPendingTestPractice(
  options: CreatePracticeOptions = {}
): Promise<Practice> {
  return createTestPractice({
    ...options,
    status: 'pending',
  });
}
