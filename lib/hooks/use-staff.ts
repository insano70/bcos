import { useApiQuery, useApiPost, useApiPut, useApiDelete, useApiMutation } from './use-api';
import { apiClient } from '@/lib/api/client';
import type { StaffMember, Education } from '@/lib/types/practice';

export interface CreateStaffData {
  practice_id: string;
  name: string;
  title?: string | undefined;
  credentials?: string | undefined;
  bio?: string | undefined;
  photo_url?: string | undefined;
  specialties?: string[] | undefined;
  education?: Education[] | undefined;
  display_order?: number | undefined;
  is_active?: boolean | undefined;
}

export interface UpdateStaffData {
  name?: string | undefined;
  title?: string | undefined;
  credentials?: string | undefined;
  bio?: string | undefined;
  photo_url?: string | undefined;
  specialties?: string[] | undefined;
  education?: Education[] | undefined;
  display_order?: number | undefined;
  is_active?: boolean | undefined;
}

/**
 * Hook to fetch staff members for a practice
 */
export function useStaff(practiceId: string) {
  return useApiQuery<StaffMember[]>(
    ['staff', practiceId],
    `/api/practices/${practiceId}/staff`,
    {
      enabled: !!practiceId,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
    }
  );
}

/**
 * Hook to fetch a single staff member
 */
export function useStaffMember(practiceId: string, staffId: string) {
  return useApiQuery<StaffMember>(
    ['staff', practiceId, staffId],
    `/api/practices/${practiceId}/staff/${staffId}`,
    {
      enabled: !!(practiceId && staffId),
      staleTime: 5 * 60 * 1000,
    }
  );
}

/**
 * Hook to create a new staff member
 */
export function useCreateStaff() {
  return useApiPost<StaffMember, CreateStaffData>(
    (data) => `/api/practices/${data.practice_id}/staff`
  );
}

/**
 * Hook to update a staff member
 */
export function useUpdateStaff() {
  return useApiMutation<StaffMember, { practiceId: string; staffId: string; data: UpdateStaffData }>(
    async ({ practiceId, staffId, data }) => {
      const url = `/api/practices/${practiceId}/staff/${staffId}`;
      return apiClient.put<StaffMember>(url, data);
    }
  );
}

/**
 * Hook to delete a staff member
 */
export function useDeleteStaff() {
  return useApiDelete<void, { practiceId: string; staffId: string }>(
    ({ practiceId, staffId }) => `/api/practices/${practiceId}/staff/${staffId}`
  );
}

/**
 * Hook to reorder staff members
 */
export function useReorderStaff() {
  return useApiPut<StaffMember[], { practiceId: string; data: { staffId: string; newOrder: number }[] }>(
    ({ practiceId }) => `/api/practices/${practiceId}/staff/reorder`
  );
}
