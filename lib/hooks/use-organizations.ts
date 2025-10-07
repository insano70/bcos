import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  parent_organization_id?: string;
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
  is_active?: boolean | undefined;
}

export interface UpdateOrganizationInput {
  name?: string | undefined;
  slug?: string | undefined;
  parent_organization_id?: string | null | undefined;
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
