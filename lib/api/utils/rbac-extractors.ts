import type { NextRequest } from 'next/server';
import type { PermissionName } from '@/lib/types/rbac';

/**
 * RBAC Resource and Organization ID Extractors
 *
 * These utility functions provide standardized ways to extract resource IDs
 * and organization IDs from requests for RBAC permission checking.
 */

/**
 * Extract user ID from URL path
 * Matches patterns like: /api/users/123, /api/admin/users/456
 */
export const extractUserId = (request: NextRequest): string | undefined => {
  const pathSegments = request.nextUrl.pathname.split('/');
  const userIndex = pathSegments.indexOf('users');
  return userIndex >= 0 && pathSegments[userIndex + 1] ? pathSegments[userIndex + 1] : undefined;
};

/**
 * Extract practice ID from URL path
 * Matches patterns like: /api/practices/123, /api/practices/abc-def/staff
 */
export const extractPracticeId = (request: NextRequest): string | undefined => {
  const pathSegments = request.nextUrl.pathname.split('/');
  const practiceIndex = pathSegments.indexOf('practices');
  return practiceIndex >= 0 && pathSegments[practiceIndex + 1]
    ? pathSegments[practiceIndex + 1]
    : undefined;
};

/**
 * Extract staff ID from URL path
 * Matches patterns like: /api/practices/123/staff/456
 */
export const extractStaffId = (request: NextRequest): string | undefined => {
  const pathSegments = request.nextUrl.pathname.split('/');
  const staffIndex = pathSegments.indexOf('staff');
  return staffIndex >= 0 && pathSegments[staffIndex + 1] ? pathSegments[staffIndex + 1] : undefined;
};

/**
 * Extract chart ID from URL path
 * Matches patterns like: /api/admin/analytics/charts/123
 */
export const extractChartId = (request: NextRequest): string | undefined => {
  const pathSegments = request.nextUrl.pathname.split('/');
  const chartIndex = pathSegments.indexOf('charts');
  return chartIndex >= 0 && pathSegments[chartIndex + 1] ? pathSegments[chartIndex + 1] : undefined;
};

/**
 * Extract dashboard ID from URL path
 * Matches patterns like: /api/admin/analytics/dashboards/123
 */
export const extractDashboardId = (request: NextRequest): string | undefined => {
  const pathSegments = request.nextUrl.pathname.split('/');
  const dashboardIndex = pathSegments.indexOf('dashboards');
  return dashboardIndex >= 0 && pathSegments[dashboardIndex + 1]
    ? pathSegments[dashboardIndex + 1]
    : undefined;
};

/**
 * Extract organization ID from request header
 * Standard header: X-Organization-ID
 */
export const extractOrganizationIdFromHeader = (request: NextRequest): string | undefined => {
  return request.headers.get('x-organization-id') || undefined;
};

/**
 * Extract organization ID from query parameter
 * Query parameter: organizationId
 */
export const extractOrganizationIdFromQuery = (request: NextRequest): string | undefined => {
  return request.nextUrl.searchParams.get('organizationId') || undefined;
};

/**
 * Extract organization ID from header or query (header takes precedence)
 * This is the most common pattern for organization scoping
 */
export const extractOrganizationId = (request: NextRequest): string | undefined => {
  return extractOrganizationIdFromHeader(request) || extractOrganizationIdFromQuery(request);
};

/**
 * Extract role ID from URL path
 * Matches patterns like: /api/roles/123
 */
export const extractRoleId = (request: NextRequest): string | undefined => {
  const pathSegments = request.nextUrl.pathname.split('/');
  const roleIndex = pathSegments.indexOf('roles');
  return roleIndex >= 0 && pathSegments[roleIndex + 1] ? pathSegments[roleIndex + 1] : undefined;
};

/**
 * Extract template ID from URL path
 * Matches patterns like: /api/templates/123
 */
export const extractTemplateId = (request: NextRequest): string | undefined => {
  const pathSegments = request.nextUrl.pathname.split('/');
  const templateIndex = pathSegments.indexOf('templates');
  return templateIndex >= 0 && pathSegments[templateIndex + 1]
    ? pathSegments[templateIndex + 1]
    : undefined;
};

/**
 * Extract organization resource ID from URL path
 * Matches patterns like: /api/organizations/123
 */
export const extractOrganizationResourceId = (request: NextRequest): string | undefined => {
  const pathSegments = request.nextUrl.pathname.split('/');
  const organizationIndex = pathSegments.indexOf('organizations');
  return organizationIndex >= 0 && pathSegments[organizationIndex + 1]
    ? pathSegments[organizationIndex + 1]
    : undefined;
};

/**
 * Extract work item ID from URL path
 * Matches patterns like: /api/work-items/123
 */
export const extractWorkItemId = (request: NextRequest): string | undefined => {
  const pathSegments = request.nextUrl.pathname.split('/');
  const workItemIndex = pathSegments.indexOf('work-items');
  return workItemIndex >= 0 && pathSegments[workItemIndex + 1]
    ? pathSegments[workItemIndex + 1]
    : undefined;
};

/**
 * Common extraction patterns grouped by use case
 */
export const extractors = {
  // Resource ID extractors
  userId: extractUserId,
  practiceId: extractPracticeId,
  staffId: extractStaffId,
  chartId: extractChartId,
  dashboardId: extractDashboardId,
  roleId: extractRoleId,
  templateId: extractTemplateId,
  organizationResourceId: extractOrganizationResourceId,
  workItemId: extractWorkItemId,

  // Organization ID extractors
  organizationId: extractOrganizationId,
  organizationIdFromHeader: extractOrganizationIdFromHeader,
  organizationIdFromQuery: extractOrganizationIdFromQuery,
} as const;

/**
 * Common RBAC configurations for different endpoint types
 */
export const rbacConfigs = {
  /**
   * Super admin configuration - requires highest level permissions
   */
  superAdmin: {
    permission: ['users:read:all', 'practices:read:all'] as PermissionName[],
    requireAllPermissions: true,
    rateLimit: 'api',
  },

  /**
   * Organization admin configuration - can manage within their org
   */
  organizationAdmin: {
    permission: ['users:create:organization', 'practices:update:own'] as PermissionName[],
    requireAllPermissions: false, // OR logic - either permission works
    extractOrganizationId: extractOrganizationId,
    rateLimit: 'api',
  },

  /**
   * Practice management configuration with resource scoping
   */
  practiceManagement: {
    extractResourceId: extractPracticeId,
    extractOrganizationId: extractOrganizationId,
    rateLimit: 'api',
  },

  /**
   * User management configuration with resource scoping
   */
  userManagement: {
    extractResourceId: extractUserId,
    extractOrganizationId: extractOrganizationId,
    rateLimit: 'api',
  },

  /**
   * Analytics configuration with organization scoping
   */
  analytics: {
    extractOrganizationId: extractOrganizationId,
    rateLimit: 'api',
  },
};
