import {
  type UseMutationOptions,
  type UseQueryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

/**
 * Custom hooks for API calls with automatic authentication error handling
 */

export interface ApiError extends Error {
  status?: number;
  code?: string;
}

/**
 * Generic hook for GET requests with React Query
 */
export function useApiQuery<T>(
  queryKey: (string | number)[],
  endpoint: string,
  options?: Omit<UseQueryOptions<T, ApiError>, 'queryKey' | 'queryFn'>
) {
  return useQuery<T, ApiError>({
    queryKey,
    queryFn: () => apiClient.get<T>(endpoint),
    ...options,
  });
}

/**
 * Generic hook for mutations (POST, PUT, DELETE, etc.)
 */
export function useApiMutation<TData, TVariables = void>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: UseMutationOptions<TData, ApiError, TVariables>
) {
  return useMutation<TData, ApiError, TVariables>({
    mutationFn,
    ...options,
  });
}

/**
 * Hook for POST requests
 */
export function useApiPost<TData, TVariables = Record<string, unknown>>(
  endpoint: string | ((variables: TVariables) => string),
  options?: UseMutationOptions<TData, ApiError, TVariables>
) {
  return useApiMutation<TData, TVariables>(async (variables) => {
    const url = typeof endpoint === 'function' ? endpoint(variables) : endpoint;
    return apiClient.post<TData>(url, variables);
  }, options);
}

/**
 * Hook for PUT requests
 */
export function useApiPut<TData, TVariables = Record<string, unknown>>(
  endpoint: string | ((variables: TVariables) => string),
  options?: UseMutationOptions<TData, ApiError, TVariables>
) {
  return useApiMutation<TData, TVariables>(async (variables) => {
    const url = typeof endpoint === 'function' ? endpoint(variables) : endpoint;
    return apiClient.put<TData>(url, variables);
  }, options);
}

/**
 * Hook for DELETE requests
 */
export function useApiDelete<TData = void, TVariables = string>(
  endpoint: string | ((variables: TVariables) => string),
  options?: UseMutationOptions<TData, ApiError, TVariables>
) {
  return useApiMutation<TData, TVariables>(async (variables) => {
    const url = typeof endpoint === 'function' ? endpoint(variables) : endpoint;
    return apiClient.delete<TData>(url);
  }, options);
}

/**
 * Hook to invalidate queries after mutations
 */
export function useInvalidateQueries() {
  const queryClient = useQueryClient();

  return (queryKeys: (string | number)[][]) => {
    queryKeys.forEach((queryKey) => {
      queryClient.invalidateQueries({ queryKey });
    });
  };
}

/**
 * Hook to update query data optimistically
 */
export function useUpdateQueryData() {
  const queryClient = useQueryClient();

  return <T>(queryKey: (string | number)[], updater: (oldData: T | undefined) => T) => {
    queryClient.setQueryData(queryKey, updater);
  };
}
