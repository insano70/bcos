import type { InferSelectModel } from 'drizzle-orm';
import { organizations } from '@/lib/db/rbac-schema';
import { getCurrentTransaction } from '@/tests/helpers/db-helper';
import { generateUniqueOrgName } from '@/tests/helpers/unique-generator';

export type Organization = InferSelectModel<typeof organizations>;

/**
 * Configuration options for creating test organizations
 */
export interface CreateOrganizationOptions {
  name?: string;
  slug?: string;
  parentId?: string | undefined;
  parent_organization_id?: string | undefined;
  isActive?: boolean;
}

/**
 * Create a test organization with default test data
 * Uses cryptographically unique identifiers for collision-free parallel testing
 */
export async function createTestOrganization(
  options: CreateOrganizationOptions = {}
): Promise<Organization> {
  const tx = getCurrentTransaction();

  const orgData = {
    name: options.name || generateUniqueOrgName(),
    slug: options.slug || generateUniqueOrgName('slug'),
    parent_organization_id: options.parentId || null,
    is_active: options.isActive ?? true,
  };

  const [organization] = await tx.insert(organizations).values(orgData).returning();
  if (!organization) {
    throw new Error('Failed to create test organization');
  }
  return organization;
}

/**
 * Create multiple test organizations in a batch
 * Useful for testing hierarchical organization structures
 */
export async function createTestOrganizations(
  count: number,
  baseOptions: CreateOrganizationOptions = {}
): Promise<Organization[]> {
  const organizations: Organization[] = [];

  for (let i = 0; i < count; i++) {
    const orgOptions: CreateOrganizationOptions = {
      ...baseOptions,
    };
    // Ensure each organization gets unique identifiers
    if (baseOptions.name) {
      orgOptions.name = `${baseOptions.name}_${i}`;
    }
    if (baseOptions.slug) {
      orgOptions.slug = `${baseOptions.slug}_${i}`;
    }
    const organization = await createTestOrganization(orgOptions);
    organizations.push(organization);
  }

  return organizations;
}

/**
 * Create an organization hierarchy with parent-child relationships
 * Useful for testing nested organization permissions
 */
export async function createOrganizationHierarchy(levels: number = 3): Promise<Organization[]> {
  const orgs: Organization[] = [];
  let parentId: string | undefined;

  for (let i = 0; i < levels; i++) {
    const org = await createTestOrganization({
      name: generateUniqueOrgName(`level${i}`),
      slug: generateUniqueOrgName(`level${i}`),
      parent_organization_id: parentId,
    });
    orgs.push(org);
    parentId = org.organization_id;
  }

  return orgs;
}

/**
 * Create an inactive test organization
 * Useful for testing deactivated organization scenarios
 */
export async function createInactiveTestOrganization(
  options: CreateOrganizationOptions = {}
): Promise<Organization> {
  return createTestOrganization({
    ...options,
    isActive: false,
  });
}
