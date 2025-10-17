/**
 * Organizations Services
 *
 * Barrel export for all organization-related services.
 * Provides backward compatibility with existing imports.
 */

// Sub-services (for direct use if needed)
export { createOrganizationCoreService } from './core-service';
export { createOrganizationHierarchyService } from './hierarchy-service';
export { createOrganizationMembersService } from './members-service';
// Main service (composite that delegates to sub-services)
export { createRBACOrganizationsService } from './organizations-service';

// Types
export type {
  CreateOrganizationData,
  OrganizationHierarchyServiceInterface,
  OrganizationMember,
  OrganizationMembersServiceInterface,
  OrganizationQueryOptions,
  OrganizationsServiceInterface,
  OrganizationWithDetails,
  PracticeInfo,
  UpdateOrganizationData,
  UserWithMembershipStatus,
} from './types';
