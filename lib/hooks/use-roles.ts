import { useApiQuery, useApiPost, useApiPut, useApiDelete } from './use-api';

export interface Role {
  id: string; // Maps to role_id in database
  name: string;
  description: string | null;
  organization_id: string | null;
  is_system_role: boolean;
  is_active: boolean;
  created_at: string;
  permissions: Array<{
    permission_id: string;
    name: string;
    description: string | null;
    resource: string;
    action: string;
    scope: string;
  }>;
}

export interface CreateRoleData {
  name: string;
  description?: string;
  organization_id?: string;
  permission_ids: string[];
  is_system_role?: boolean;
}

export interface UpdateRoleData {
  name?: string;
  description?: string;
  permission_ids?: string[];
  is_active?: boolean;
}

/**
 * Hook to fetch all roles
 */
export function useRoles() {
  return useApiQuery<Role[]>(
    ['roles'],
    '/api/roles',
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
    }
  );
}

/**
 * Hook to fetch a single role by ID
 */
export function useRole(roleId: string) {
  return useApiQuery<Role>(
    ['roles', roleId],
    `/api/roles/${roleId}`,
    {
      enabled: !!roleId,
      staleTime: 5 * 60 * 1000,
    }
  );
}

/**
 * Hook to create a new role
 */
export function useCreateRole() {
  return useApiPost<Role, CreateRoleData>('/api/roles');
}

/**
 * Hook to update a role
 */
export function useUpdateRole() {
  return useApiPut<Role, { id: string; data: UpdateRoleData }>(
    ({ id }) => `/api/roles/${id}`
  );
}

/**
 * Hook to delete a role
 */
export function useDeleteRole() {
  return useApiDelete<void, string>(
    (roleId) => `/api/roles/${roleId}`
  );
}
