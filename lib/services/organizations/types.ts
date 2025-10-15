import type { Organization } from '@/lib/types/rbac';

/**
 * Shared type definitions for Organizations services
 *
 * Extracted from monolithic organizations service to reduce duplication
 * and improve maintainability across multiple service files.
 */

// ============================================================
// SERVICE INTERFACES
// ============================================================

/**
 * Main Organizations Service Interface
 * Core CRUD operations with RBAC enforcement
 */
export interface OrganizationsServiceInterface {
  getOrganizations(options?: OrganizationQueryOptions): Promise<OrganizationWithDetails[]>;
  getOrganizationById(organizationId: string): Promise<OrganizationWithDetails | null>;
  createOrganization(data: CreateOrganizationData): Promise<OrganizationWithDetails>;
  updateOrganization(
    organizationId: string,
    data: UpdateOrganizationData
  ): Promise<OrganizationWithDetails>;
  deleteOrganization(organizationId: string): Promise<void>;
  getAccessibleHierarchy(rootOrganizationId?: string): Promise<Organization[]>;
  getOrganizationMembers(organizationId: string): Promise<OrganizationMember[]>;
  canManageOrganization(organizationId: string): boolean;
  getOrganizationUsersWithStatus(organizationId: string): Promise<UserWithMembershipStatus[]>;
  updateOrganizationUsers(
    organizationId: string,
    addUserIds: string[],
    removeUserIds: string[]
  ): Promise<{ added: number; removed: number }>;
}

/**
 * Organization Hierarchy Service Interface
 * Handles tree structures and parent-child relationships
 */
export interface OrganizationHierarchyServiceInterface {
  getAccessibleHierarchy(rootOrganizationId?: string): Promise<Organization[]>;
  getOrganizationAncestors(organizationId: string): Promise<Organization[]>;
  getOrganizationDescendants(organizationId: string): Promise<Organization[]>;
  validateHierarchyMove(organizationId: string, newParentId: string): Promise<boolean>;
}

/**
 * Organization Members Service Interface
 * Handles user-organization associations and member management
 */
export interface OrganizationMembersServiceInterface {
  getOrganizationMembers(organizationId: string): Promise<OrganizationMember[]>;
  getOrganizationUsersWithStatus(organizationId: string): Promise<UserWithMembershipStatus[]>;
  addUserToOrganization(organizationId: string, userId: string): Promise<void>;
  removeUserFromOrganization(organizationId: string, userId: string): Promise<void>;
  updateOrganizationUsers(
    organizationId: string,
    addUserIds: string[],
    removeUserIds: string[]
  ): Promise<{ added: number; removed: number }>;
  getMemberCount(organizationId: string): Promise<number>;
  getBatchMemberCounts(organizationIds: string[]): Promise<Map<string, number>>;
}

// ============================================================
// DATA TRANSFER OBJECTS
// ============================================================

/**
 * Organization creation data
 */
export interface CreateOrganizationData {
  name: string;
  slug: string;
  parent_organization_id?: string | undefined;
  practice_uids?: number[] | undefined; // Analytics security - practice_uid filtering
  is_active?: boolean | undefined;
}

/**
 * Organization update data
 */
export interface UpdateOrganizationData {
  name?: string | undefined;
  slug?: string | undefined;
  parent_organization_id?: string | null | undefined;
  practice_uids?: number[] | undefined; // Analytics security - practice_uid filtering
  is_active?: boolean | undefined;
}

/**
 * Organization query options for filtering and pagination
 */
export interface OrganizationQueryOptions {
  search?: string | undefined;
  parent_organization_id?: string | undefined;
  is_active?: boolean | undefined;
  include_children?: boolean | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

// ============================================================
// DOMAIN MODELS
// ============================================================

/**
 * Practice information associated with an organization
 * Maps healthcare 'practices' concept to RBAC 'organizations'
 */
export interface PracticeInfo {
  practice_id: string;
  domain: string;
  status: string;
  template_id: string;
}

/**
 * Organization with enriched details
 * Includes member counts, children counts, and practice mapping
 */
export interface OrganizationWithDetails extends Organization {
  member_count: number;
  practice_info?: PracticeInfo | undefined;
  children_count: number;
  parent?: Organization;
}

/**
 * Organization member information
 */
export interface OrganizationMember {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  joined_at: Date | null;
}

/**
 * User with organization membership status
 * Used for member management UIs
 */
export interface UserWithMembershipStatus {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  email_verified: boolean;
  created_at: Date;
  is_member: boolean;
  joined_at?: Date;
}

// ============================================================
// INTERNAL QUERY TYPES
// ============================================================

/**
 * Raw organization row from database with practice join
 * Internal type used by query builder
 */
export interface RawOrganizationRow {
  organization_id: string;
  name: string;
  slug: string;
  parent_organization_id: string | null;
  is_active: boolean | null;
  created_at: Date | null;
  updated_at: Date | null;
  deleted_at: Date | null;
  practice_id: string | null;
  practice_domain: string | null;
  practice_status: string | null;
  practice_template_id: string | null;
}

/**
 * Member count result from batch query
 */
export interface MemberCountResult {
  organization_id: string;
  count: number | string; // Drizzle returns count as string
}

/**
 * Children count result from batch query
 */
export interface ChildrenCountResult {
  parent_organization_id: string | null;
  count: number | string; // Drizzle returns count as string
}
