/**
 * API Type Definitions for Authentication Service
 *
 * These types represent the structure of responses from the authentication API.
 * They are used to eliminate 'any' type usage in auth-client.ts during API response transformation.
 *
 * IMPORTANT: These types must match the actual API response structure.
 * If the API changes, update these types accordingly.
 */

/**
 * API User Response
 * Represents the complete user object returned from the authentication API
 */
export interface ApiUser {
  /** User's unique identifier */
  id: number;

  /** User's email address */
  email: string;

  /** User's first name */
  firstName: string;

  /** User's last name */
  lastName: string;

  /** Whether the user's email has been verified */
  emailVerified: boolean;

  /** Roles assigned to the user */
  roles: ApiRole[];

  /** Organizations the user belongs to */
  organizations: ApiOrganization[];

  /** Organizations the user can access (may include hierarchy) */
  accessibleOrganizations?: ApiOrganization[];

  /** All permissions granted to the user (flattened from roles) */
  permissions: ApiPermission[];

  /** Current active organization ID for the user's session */
  currentOrganizationId: string;

  /** Whether the user is a super administrator */
  isSuperAdmin: boolean;

  /** Organization IDs where the user has admin privileges */
  organizationAdminFor: string[];
}

/**
 * API Role Response
 * Represents a role in the RBAC system
 */
export interface ApiRole {
  /** Role's unique identifier */
  id: number;

  /** Role name (e.g., 'Admin', 'User', 'Viewer') */
  name: string;

  /** Human-readable description of the role */
  description?: string;

  /** Whether this is a system-level role (vs organization-specific) */
  isSystemRole: boolean;
}

/**
 * API Organization Response
 * Represents an organization in the system
 */
export interface ApiOrganization {
  /** Organization's unique identifier */
  id: string;

  /** Organization name */
  name: string;

  /** URL-friendly slug for the organization */
  slug: string;
}

/**
 * API Permission Response
 * Represents a permission in the RBAC system
 */
export interface ApiPermission {
  /** Permission's unique identifier */
  id: number;

  /** Permission name (e.g., 'analytics:read:all') */
  name: string;

  /** Resource the permission applies to (e.g., 'analytics', 'users') */
  resource: string;

  /** Action allowed by the permission (e.g., 'read', 'write', 'delete') */
  action: string;

  /** Scope of the permission (e.g., 'all', 'organization', 'own') */
  scope: string;
}
