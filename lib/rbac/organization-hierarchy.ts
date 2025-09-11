import { db } from '@/lib/db';
import { organizations } from '@/lib/db/schema';
import { eq, isNull, and } from 'drizzle-orm';
import type { Organization } from '@/lib/types/rbac';

/**
 * Organization Hierarchy Service
 * Handles parent-child organization relationships for healthcare practice groups
 */

/**
 * Get organization with all its descendants (children, grandchildren, etc.)
 * Useful for determining which organizations a user can access
 */
export async function getOrganizationHierarchy(organizationId: string): Promise<Organization[]> {
  const visited = new Set<string>();
  const hierarchy: Organization[] = [];

  await traverseOrganizationTree(organizationId, visited, hierarchy);
  return hierarchy;
}

/**
 * Recursive function to traverse organization tree
 */
async function traverseOrganizationTree(
  organizationId: string,
  visited: Set<string>,
  result: Organization[]
): Promise<void> {
  // Prevent infinite loops
  if (visited.has(organizationId)) {
    return;
  }
  visited.add(organizationId);

  // Get the current organization
  const [org] = await db
    .select({
      organization_id: organizations.organization_id,
      name: organizations.name,
      slug: organizations.slug,
      parent_organization_id: organizations.parent_organization_id,
      is_active: organizations.is_active,
      created_at: organizations.created_at,
      updated_at: organizations.updated_at,
      deleted_at: organizations.deleted_at
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.organization_id, organizationId),
        eq(organizations.is_active, true),
        isNull(organizations.deleted_at)
      )
    )
    .limit(1);

  if (!org) {
    return; // Organization not found or inactive
  }

  // Add current organization to result
  result.push({
    organization_id: org.organization_id,
    name: org.name,
    slug: org.slug,
    parent_organization_id: org.parent_organization_id || undefined,
    is_active: org.is_active ?? true,
    created_at: org.created_at ?? new Date(),
    updated_at: org.updated_at ?? new Date(),
    deleted_at: org.deleted_at || undefined
  });

  // Get all child organizations
  const children = await db
    .select({
      organization_id: organizations.organization_id,
      name: organizations.name,
      slug: organizations.slug,
      parent_organization_id: organizations.parent_organization_id,
      is_active: organizations.is_active,
      created_at: organizations.created_at,
      updated_at: organizations.updated_at,
      deleted_at: organizations.deleted_at
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.parent_organization_id, organizationId),
        eq(organizations.is_active, true),
        isNull(organizations.deleted_at)
      )
    );

  // Recursively process children
  for (const child of children) {
    await traverseOrganizationTree(child.organization_id, visited, result);
  }
}

/**
 * Get all parent organizations up to the root
 */
export async function getOrganizationAncestors(organizationId: string): Promise<Organization[]> {
  const ancestors: Organization[] = [];
  let currentId: string | null = organizationId;

  while (currentId) {
    const [org] = await db
      .select({
        organization_id: organizations.organization_id,
        name: organizations.name,
        slug: organizations.slug,
        parent_organization_id: organizations.parent_organization_id,
        is_active: organizations.is_active,
        created_at: organizations.created_at,
        updated_at: organizations.updated_at,
        deleted_at: organizations.deleted_at
      })
      .from(organizations)
      .where(
        and(
          eq(organizations.organization_id, currentId),
          eq(organizations.is_active, true),
          isNull(organizations.deleted_at)
        )
      )
      .limit(1);

    if (!org) {
      break; // Organization not found or inactive
    }

    ancestors.push({
      organization_id: org.organization_id,
      name: org.name,
      slug: org.slug,
      parent_organization_id: org.parent_organization_id || undefined,
      is_active: org.is_active ?? true,
      created_at: org.created_at ?? new Date(),
      updated_at: org.updated_at ?? new Date(),
      deleted_at: org.deleted_at || undefined
    });

    currentId = org.parent_organization_id;
  }

  return ancestors;
}

/**
 * Get direct children of an organization
 */
export async function getOrganizationChildren(organizationId: string): Promise<Organization[]> {
  const children = await db
    .select({
      organization_id: organizations.organization_id,
      name: organizations.name,
      slug: organizations.slug,
      parent_organization_id: organizations.parent_organization_id,
      is_active: organizations.is_active,
      created_at: organizations.created_at,
      updated_at: organizations.updated_at,
      deleted_at: organizations.deleted_at
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.parent_organization_id, organizationId),
        eq(organizations.is_active, true),
        isNull(organizations.deleted_at)
      )
    );

  return children.map(org => ({
    organization_id: org.organization_id,
    name: org.name,
    slug: org.slug,
    parent_organization_id: org.parent_organization_id || undefined,
    is_active: org.is_active ?? true,
    created_at: org.created_at ?? new Date(),
    updated_at: org.updated_at ?? new Date(),
    deleted_at: org.deleted_at || undefined
  }));
}

/**
 * Check if organization A is a descendant of organization B
 */
export async function isOrganizationDescendant(
  childId: string,
  ancestorId: string
): Promise<boolean> {
  if (childId === ancestorId) {
    return true; // Same organization
  }

  const ancestors = await getOrganizationAncestors(childId);
  return ancestors.some(ancestor => ancestor.organization_id === ancestorId);
}

/**
 * Get root organizations (no parent)
 */
export async function getRootOrganizations(): Promise<Organization[]> {
  const rootOrgs = await db
    .select({
      organization_id: organizations.organization_id,
      name: organizations.name,
      slug: organizations.slug,
      parent_organization_id: organizations.parent_organization_id,
      is_active: organizations.is_active,
      created_at: organizations.created_at,
      updated_at: organizations.updated_at,
      deleted_at: organizations.deleted_at
    })
    .from(organizations)
    .where(
      and(
        isNull(organizations.parent_organization_id),
        eq(organizations.is_active, true),
        isNull(organizations.deleted_at)
      )
    );

  return rootOrgs.map(org => ({
    organization_id: org.organization_id,
    name: org.name,
    slug: org.slug,
    parent_organization_id: org.parent_organization_id || undefined,
    is_active: org.is_active ?? true,
    created_at: org.created_at ?? new Date(),
    updated_at: org.updated_at ?? new Date(),
    deleted_at: org.deleted_at || undefined
  }));
}

/**
 * Validate organization hierarchy integrity
 * Prevents circular references and ensures valid parent-child relationships
 */
export async function validateOrganizationHierarchy(
  organizationId: string,
  newParentId?: string
): Promise<{ valid: boolean; error?: string }> {
  if (!newParentId) {
    return { valid: true }; // No parent is always valid
  }

  if (organizationId === newParentId) {
    return {
      valid: false,
      error: 'Organization cannot be its own parent'
    };
  }

  // Check if the new parent is actually a descendant (would create a cycle)
  const isDescendant = await isOrganizationDescendant(newParentId, organizationId);
  if (isDescendant) {
    return {
      valid: false,
      error: 'Cannot set descendant organization as parent (would create cycle)'
    };
  }

  // Check if new parent exists and is active
  const [parentOrg] = await db
    .select({ organization_id: organizations.organization_id })
    .from(organizations)
    .where(
      and(
        eq(organizations.organization_id, newParentId),
        eq(organizations.is_active, true),
        isNull(organizations.deleted_at)
      )
    )
    .limit(1);

  if (!parentOrg) {
    return {
      valid: false,
      error: 'Parent organization not found or inactive'
    };
  }

  return { valid: true };
}

/**
 * Get organization depth in hierarchy (root = 0)
 */
export async function getOrganizationDepth(organizationId: string): Promise<number> {
  const ancestors = await getOrganizationAncestors(organizationId);
  return ancestors.length - 1; // Subtract 1 because ancestors includes the org itself
}

/**
 * Get organization tree structure for UI display
 */
export interface OrganizationTreeNode extends Organization {
  children: OrganizationTreeNode[];
  depth: number;
}

export async function getOrganizationTree(rootOrganizationId?: string): Promise<OrganizationTreeNode[]> {
  const rootOrgs = rootOrganizationId
    ? [await getOrganizationById(rootOrganizationId)].filter(Boolean) as Organization[]
    : await getRootOrganizations();

  const tree: OrganizationTreeNode[] = [];

  for (const rootOrg of rootOrgs) {
    const treeNode = await buildOrganizationTreeNode(rootOrg, 0);
    if (treeNode) {
      tree.push(treeNode);
    }
  }

  return tree;
}

async function buildOrganizationTreeNode(
  org: Organization,
  depth: number
): Promise<OrganizationTreeNode | null> {
  if (depth > 10) {
    // Prevent infinite recursion
    console.warn(`Organization hierarchy depth limit reached for ${org.organization_id}`);
    return null;
  }

  const children = await getOrganizationChildren(org.organization_id);
  const childNodes: OrganizationTreeNode[] = [];

  for (const child of children) {
    const childNode = await buildOrganizationTreeNode(child, depth + 1);
    if (childNode) {
      childNodes.push(childNode);
    }
  }

  return {
    ...org,
    children: childNodes,
    depth
  };
}

/**
 * Helper function to get organization by ID
 */
async function getOrganizationById(organizationId: string): Promise<Organization | null> {
  const [org] = await db
    .select({
      organization_id: organizations.organization_id,
      name: organizations.name,
      slug: organizations.slug,
      parent_organization_id: organizations.parent_organization_id,
      is_active: organizations.is_active,
      created_at: organizations.created_at,
      updated_at: organizations.updated_at,
      deleted_at: organizations.deleted_at
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.organization_id, organizationId),
        eq(organizations.is_active, true),
        isNull(organizations.deleted_at)
      )
    )
    .limit(1);

  if (!org) {
    return null;
  }

  return {
    organization_id: org.organization_id,
    name: org.name,
    slug: org.slug,
    parent_organization_id: org.parent_organization_id || undefined,
    is_active: org.is_active ?? true,
    created_at: org.created_at ?? new Date(),
    updated_at: org.updated_at ?? new Date(),
    deleted_at: org.deleted_at || undefined
  };
}
