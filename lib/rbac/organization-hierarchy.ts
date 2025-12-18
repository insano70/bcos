import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { organizations } from '@/lib/db/schema';
import { log } from '@/lib/logger';
import type { Organization } from '@/lib/types/rbac';

/**
 * Organization Hierarchy Service
 * Handles parent-child organization relationships for healthcare practice groups
 */

/**
 * Gets an organization with all its descendants (children, grandchildren, etc.)
 *
 * Useful for determining which organizations a user can access based on
 * their membership in a parent organization.
 *
 * @param organizationId - The ID of the root organization to start from
 * @returns Array of organizations including the root and all descendants
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
      deleted_at: organizations.deleted_at,
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
    deleted_at: org.deleted_at || undefined,
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
      deleted_at: organizations.deleted_at,
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
 * Gets all parent organizations up to the root
 *
 * Returns the chain of parent organizations from the given organization
 * up to the root (an organization with no parent).
 *
 * @param organizationId - The ID of the organization to find ancestors for
 * @returns Array of ancestor organizations, starting with the given organization
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
        deleted_at: organizations.deleted_at,
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
      deleted_at: org.deleted_at || undefined,
    });

    currentId = org.parent_organization_id;
  }

  return ancestors;
}

/**
 * Gets direct children of an organization
 *
 * Returns only immediate children, not grandchildren or further descendants.
 *
 * @param organizationId - The ID of the parent organization
 * @returns Array of direct child organizations
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
      deleted_at: organizations.deleted_at,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.parent_organization_id, organizationId),
        eq(organizations.is_active, true),
        isNull(organizations.deleted_at)
      )
    );

  return children.map((org) => ({
    organization_id: org.organization_id,
    name: org.name,
    slug: org.slug,
    parent_organization_id: org.parent_organization_id || undefined,
    is_active: org.is_active ?? true,
    created_at: org.created_at ?? new Date(),
    updated_at: org.updated_at ?? new Date(),
    deleted_at: org.deleted_at || undefined,
  }));
}

/**
 * Checks if one organization is a descendant of another
 *
 * Returns true if the child is a descendant of the ancestor (at any depth),
 * or if they are the same organization.
 *
 * @param childId - The ID of the potential descendant organization
 * @param ancestorId - The ID of the potential ancestor organization
 * @returns True if childId is a descendant of ancestorId or they are the same
 */
export async function isOrganizationDescendant(
  childId: string,
  ancestorId: string
): Promise<boolean> {
  if (childId === ancestorId) {
    return true; // Same organization
  }

  const ancestors = await getOrganizationAncestors(childId);
  return ancestors.some((ancestor) => ancestor.organization_id === ancestorId);
}

/**
 * Gets all root organizations (organizations with no parent)
 *
 * Root organizations are at the top of the hierarchy and typically
 * represent top-level healthcare practice groups.
 *
 * @returns Array of root organizations
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
      deleted_at: organizations.deleted_at,
    })
    .from(organizations)
    .where(
      and(
        isNull(organizations.parent_organization_id),
        eq(organizations.is_active, true),
        isNull(organizations.deleted_at)
      )
    );

  return rootOrgs.map((org) => ({
    organization_id: org.organization_id,
    name: org.name,
    slug: org.slug,
    parent_organization_id: org.parent_organization_id || undefined,
    is_active: org.is_active ?? true,
    created_at: org.created_at ?? new Date(),
    updated_at: org.updated_at ?? new Date(),
    deleted_at: org.deleted_at || undefined,
  }));
}

/**
 * Validates organization hierarchy integrity
 *
 * Prevents circular references and ensures valid parent-child relationships.
 * Should be called before changing an organization's parent.
 *
 * @param organizationId - The ID of the organization being modified
 * @param newParentId - The proposed new parent organization ID (optional)
 * @returns Object with valid flag and optional error message
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
      error: 'Organization cannot be its own parent',
    };
  }

  // Check if the new parent is actually a descendant (would create a cycle)
  const isDescendant = await isOrganizationDescendant(newParentId, organizationId);
  if (isDescendant) {
    return {
      valid: false,
      error: 'Cannot set descendant organization as parent (would create cycle)',
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
      error: 'Parent organization not found or inactive',
    };
  }

  return { valid: true };
}

/**
 * Gets the depth of an organization in the hierarchy
 *
 * Root organizations have depth 0, their children have depth 1, etc.
 *
 * @param organizationId - The ID of the organization
 * @returns The depth level (0 for root organizations)
 */
export async function getOrganizationDepth(organizationId: string): Promise<number> {
  const ancestors = await getOrganizationAncestors(organizationId);
  return ancestors.length - 1; // Subtract 1 because ancestors includes the org itself
}

/**
 * Organization tree node structure for hierarchical UI display
 */
export interface OrganizationTreeNode extends Organization {
  children: OrganizationTreeNode[];
  depth: number;
}

/**
 * Builds a complete organization tree structure for UI display
 *
 * Creates a hierarchical tree of organizations with depth information,
 * useful for rendering organization hierarchies in dropdown menus or tree views.
 *
 * @param rootOrganizationId - Optional ID to start from (defaults to all root organizations)
 * @returns Array of tree nodes with nested children and depth levels
 */
export async function getOrganizationTree(
  rootOrganizationId?: string
): Promise<OrganizationTreeNode[]> {
  const rootOrgs = rootOrganizationId
    ? ([await getOrganizationById(rootOrganizationId)].filter(Boolean) as Organization[])
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
    log.warn('organization hierarchy depth limit reached', {
      organizationId: org.organization_id,
      depth,
      component: 'rbac',
      operation: 'build_organization_tree',
    });
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
    depth,
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
      deleted_at: organizations.deleted_at,
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
    deleted_at: org.deleted_at || undefined,
  };
}
