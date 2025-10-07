import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

interface OrganizationsResponse {
  success: boolean;
  data: Organization[];
  meta?: {
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
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

export function useCreateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<Organization>) => {
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
    mutationFn: async ({ id, data }: { id: string; data: Partial<Organization> }) => {
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
