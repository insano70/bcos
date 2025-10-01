import { useApiDelete, useApiPost, useApiPut, useApiQuery } from './use-api';

export interface Practice {
  id: string; // Maps to practice_id in database
  name: string;
  domain: string;
  status: string;
  template_id: string;
  template_name: string;
  owner_email: string;
  created_at: string;
}

export interface CreatePracticeData {
  name: string;
  domain: string;
  template_id: string;
  owner_user_id?: string;
}

export interface UpdatePracticeData {
  name?: string;
  domain?: string;
  template_id?: string;
  status?: string;
}

/**
 * Hook to fetch all practices
 */
export function usePractices() {
  return useApiQuery<Practice[]>(['practices'], '/api/practices', {
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook to fetch a single practice by ID
 */
export function usePractice(practiceId: string) {
  return useApiQuery<Practice>(['practices', practiceId], `/api/practices/${practiceId}`, {
    enabled: !!practiceId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to create a new practice
 */
export function useCreatePractice() {
  return useApiPost<Practice, CreatePracticeData>('/api/practices');
}

/**
 * Hook to update a practice
 */
export function useUpdatePractice() {
  return useApiPut<Practice, { id: string; data: UpdatePracticeData }>(
    ({ id }) => `/api/practices/${id}`
  );
}

/**
 * Hook to delete a practice
 */
export function useDeletePractice() {
  return useApiDelete<void, string>((practiceId) => `/api/practices/${practiceId}`);
}
