import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  parent_organization_id?: string;
  practice_uids?: number[] | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  member_count?: number;
  children_count?: number;
}

export function useOrganizations() {
  return useQuery<Organization[], Error>({
    queryKey: ['organizations'],
    queryFn: async () => {
      const data = await apiClient.get<Organization[]>('/api/organizations');
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - prevents excessive refetches
    gcTime: 10 * 60 * 1000, // 10 minutes - cache retention
  });
}

export function useOrganization(id: string) {
  return useQuery<Organization, Error>({
    queryKey: ['organizations', id],
    queryFn: async () => {
      const data = await apiClient.get<Organization>(`/api/organizations/${id}`);
      return data;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  parent_organization_id?: string | undefined;
  practice_uids?: number[] | undefined; // Analytics security - practice_uid filtering
  is_active?: boolean | undefined;
}

export interface UpdateOrganizationInput {
  name?: string | undefined;
  slug?: string | undefined;
  parent_organization_id?: string | null | undefined;
  practice_uids?: number[] | undefined; // Analytics security - practice_uid filtering
  is_active?: boolean | undefined;
}

export function useCreateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateOrganizationInput) => {
      const result = await apiClient.post<Organization>('/api/organizations', data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateOrganizationInput }) => {
      const result = await apiClient.put<Organization>(`/api/organizations/${id}`, { data });
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['organizations', variables.id] });
    },
  });
}

export function useDeleteOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/organizations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}

export interface OrganizationUser {
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

export function useOrganizationUsers(organizationId: string) {
  return useQuery<OrganizationUser[], Error>({
    queryKey: ['organizations', organizationId, 'users'],
    queryFn: async () => {
      const data = await apiClient.get<OrganizationUser[]>(
        `/api/organizations/${organizationId}/users`
      );
      return data;
    },
    enabled: !!organizationId,
    staleTime: 2 * 60 * 1000, // 2 minutes - user membership changes more frequently
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

export interface UpdateOrganizationUsersInput {
  add_user_ids: string[];
  remove_user_ids: string[];
}

export function useUpdateOrganizationUsers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      organizationId,
      data,
    }: {
      organizationId: string;
      data: UpdateOrganizationUsersInput;
    }) => {
      const result = await apiClient.put<{
        added: number;
        removed: number;
        organization_id: string;
      }>(`/api/organizations/${organizationId}/users`, data);
      return result;
    },
    onSuccess: (_, variables) => {
      // Invalidate organization users list
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.organizationId, 'users'],
      });
      // Invalidate organization details (member_count may have changed)
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.organizationId],
      });
      // Invalidate organizations list (member_count in list may have changed)
      queryClient.invalidateQueries({
        queryKey: ['organizations'],
      });
    },
  });
}
