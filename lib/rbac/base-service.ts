import { PermissionChecker } from './permission-checker';
import type { db } from '@/lib/db';
import { 
  type UserContext, 
  type AccessScope, 
  type PermissionName,
  type ResourceType,
  type ActionType,
  type DataAccessFilter,
  PermissionDeniedError,
  OrganizationAccessError
} from '@/lib/types/rbac';

/**
 * Base RBAC Service Class
 * Provides common permission checking and data filtering functionality for all services
 */
export abstract class BaseRBACService {
  protected checker: PermissionChecker;
  
  constructor(protected userContext: UserContext, protected dbContext?: typeof db) {
    this.checker = new PermissionChecker(userContext);
  }

  /**
   * Require a specific permission (throws if not granted)
   */
  protected requirePermission(
    permission: PermissionName,
    resourceId?: string,
    organizationId?: string
  ): void {
    if (!this.checker.hasPermission(permission, resourceId, organizationId)) {
      throw new PermissionDeniedError(permission, resourceId, organizationId);
    }
  }

  /**
   * Require any of multiple permissions
   */
  protected requireAnyPermission(
    permissions: PermissionName[],
    resourceId?: string,
    organizationId?: string
  ): void {
    if (!this.checker.hasAnyPermission(permissions, resourceId, organizationId)) {
      throw new PermissionDeniedError(permissions.join(' or '), resourceId, organizationId);
    }
  }

  /**
   * Require all of multiple permissions
   */
  protected requireAllPermissions(
    permissions: PermissionName[],
    resourceId?: string,
    organizationId?: string
  ): void {
    if (!this.checker.hasAllPermissions(permissions, resourceId, organizationId)) {
      throw new PermissionDeniedError(permissions.join(' and '), resourceId, organizationId);
    }
  }

  /**
   * Get access scope for a resource:action combination
   */
  protected getAccessScope(resource: ResourceType, action: ActionType): AccessScope {
    return this.checker.getAccessScope(resource, action);
  }

  /**
   * Check if user can access a specific organization
   */
  protected canAccessOrganization(organizationId: string): boolean {
    return this.checker.canAccessOrganization(organizationId);
  }

  /**
   * Require access to a specific organization
   */
  protected requireOrganizationAccess(organizationId: string): void {
    if (!this.canAccessOrganization(organizationId)) {
      throw new OrganizationAccessError(organizationId);
    }
  }

  /**
   * Generate data access filter based on user's permissions
   */
  protected getDataAccessFilter(resource: ResourceType, action: ActionType): DataAccessFilter {
    const accessScope = this.getAccessScope(resource, action);

    switch (accessScope.scope) {
      case 'own':
        return {
          user_id: this.userContext.user_id,
          scope: 'own',
          accessible_resources: [this.userContext.user_id]
        };

      case 'organization':
        return {
          organization_ids: accessScope.organizationIds || [],
          scope: 'organization',
          accessible_resources: accessScope.organizationIds || []
        };

      case 'all':
        return {
          scope: 'all',
          accessible_resources: [] // No filtering needed for 'all' scope
        };

      default:
        throw new PermissionDeniedError(`${resource}:${action}:*`);
    }
  }

  /**
   * Check if user is super admin
   */
  protected isSuperAdmin(): boolean {
    return this.checker.isSuperAdmin();
  }

  /**
   * Check if user is admin for specific organization
   */
  protected isOrganizationAdmin(organizationId?: string): boolean {
    return this.checker.isOrganizationAdmin(organizationId);
  }

  /**
   * Get user's current organization
   */
  protected getCurrentOrganization() {
    return this.checker.getCurrentOrganization();
  }

  /**
   * Validate resource ownership for 'own' scope permissions
   */
  protected validateResourceOwnership(resourceId: string, resourceUserId: string): void {
    if (resourceId !== this.userContext.user_id && resourceUserId !== this.userContext.user_id) {
      throw new PermissionDeniedError('Resource access denied', resourceId);
    }
  }

  /**
   * Get accessible organization IDs for current user
   */
  protected getAccessibleOrganizationIds(): string[] {
    return this.userContext.accessible_organizations.map(org => org.organization_id);
  }

  /**
   * Filter data based on organizational access
   */
  protected filterByOrganizationalAccess<T extends { organization_id?: string }>(
    data: T[]
  ): T[] {
    const accessibleOrgIds = this.getAccessibleOrganizationIds();
    
    return data.filter(item => 
      !item.organization_id || accessibleOrgIds.includes(item.organization_id)
    );
  }

  /**
   * Filter data based on user ownership
   */
  protected filterByUserOwnership<T extends { user_id?: string }>(
    data: T[]
  ): T[] {
    return data.filter(item => 
      !item.user_id || item.user_id === this.userContext.user_id
    );
  }

  /**
   * Apply automatic data filtering based on permission scope
   */
  protected applyDataFilter<T extends { user_id?: string; organization_id?: string }>(
    data: T[],
    resource: ResourceType,
    action: ActionType
  ): T[] {
    const filter = this.getDataAccessFilter(resource, action);

    switch (filter.scope) {
      case 'own':
        return this.filterByUserOwnership(data);

      case 'organization':
        return this.filterByOrganizationalAccess(data);

      case 'all':
        return data; // No filtering for super admin

      default:
        return [];
    }
  }

  /**
   * Log permission check for audit trail
   */
  protected async logPermissionCheck(
    permission: string,
    resourceId?: string,
    organizationId?: string,
    granted = true
  ): Promise<void> {
    // TODO: Implement audit logging in Phase 7
    console.log(`Permission check: ${this.userContext.user_id} -> ${permission} = ${granted ? 'GRANTED' : 'DENIED'}`, {
      resourceId,
      organizationId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Validate request context and extract common parameters
   */
  protected validateRequestContext(
    organizationId?: string,
    resourceId?: string
  ): { validatedOrgId?: string | undefined; validatedResourceId?: string | undefined } {
    let validatedOrgId = organizationId;
    
    // Use current organization if none specified
    if (!validatedOrgId) {
      validatedOrgId = this.userContext.current_organization_id;
    }

    // Validate organization access if specified
    if (validatedOrgId && !this.canAccessOrganization(validatedOrgId)) {
      throw new OrganizationAccessError(validatedOrgId);
    }

    return {
      validatedOrgId,
      validatedResourceId: resourceId
    };
  }

  /**
   * Get user context (for service composition)
   */
  protected getUserContext(): UserContext {
    return this.userContext;
  }

  /**
   * Check if current user can perform action on specific resource
   */
  protected canPerformAction(
    resource: ResourceType,
    action: ActionType,
    resourceId?: string,
    organizationId?: string
  ): boolean {
    const permission = `${resource}:${action}:organization` as PermissionName;
    return this.checker.hasPermission(permission, resourceId, organizationId) ||
           this.checker.hasPermission(`${resource}:${action}:all` as PermissionName, resourceId, organizationId);
  }

  /**
   * Get effective permissions for a resource type
   */
  protected getEffectivePermissions(resource: ResourceType): string[] {
    return this.checker.getAllPermissions()
      .filter(permission => permission.resource === resource)
      .map(permission => permission.name);
  }

  /**
   * Check if user has any management permissions for a resource
   */
  protected hasManagementPermissions(resource: ResourceType): boolean {
    const managementActions = ['create', 'update', 'delete', 'manage'];
    return managementActions.some(action =>
      this.canPerformAction(resource, action as ActionType)
    );
  }
}

/**
 * Factory function to create service instances with user context
 */
export function createServiceWithContext<T extends BaseRBACService>(
  ServiceClass: new (userContext: UserContext) => T,
  userContext: UserContext
): T {
  return new ServiceClass(userContext);
}

/**
 * Service composition helper for multiple services
 */
export class ServiceContainer {
  private services = new Map<string, BaseRBACService>();

  constructor(private userContext: UserContext) {}

  /**
   * Register a service instance
   */
  register<T extends BaseRBACService>(
    name: string,
    ServiceClass: new (userContext: UserContext) => T
  ): T {
    const service = new ServiceClass(this.userContext);
    this.services.set(name, service);
    return service;
  }

  /**
   * Get a registered service
   */
  get<T extends BaseRBACService>(name: string): T | undefined {
    return this.services.get(name) as T | undefined;
  }

  /**
   * Check if user context is still valid
   */
  isContextValid(): boolean {
    return this.userContext.is_active && 
           this.userContext.accessible_organizations.length > 0;
  }

  /**
   * Get all registered service names
   */
  getServiceNames(): string[] {
    return Array.from(this.services.keys());
  }
}
