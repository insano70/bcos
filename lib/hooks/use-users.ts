import { useApiDelete, useApiPost, useApiPut, useApiQuery } from './use-api';

export interface User {
  id: string; // Maps to user_id in database
  first_name: string;
  last_name: string;
  email: string;
  email_verified: boolean | null;
  is_active: boolean | null;
  organization_id?: string | null;
  provider_uid?: number | null;
  created_at: string;
  deleted_at: string | null;
  roles?: Array<{
    id: string;
    name: string;
  }>;
  mfa_enabled?: boolean | null;
  mfa_method?: string | null;
  mfa_credentials_count?: number;
}

export interface CreateUserData {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role_ids: string[];
  email_verified?: boolean;
  is_active?: boolean;
}

export interface UpdateUserData {
  first_name?: string | undefined;
  last_name?: string | undefined;
  email?: string | undefined;
  password?: string | undefined;
  organization_id?: string | undefined;
  role_ids?: string[] | undefined;
  email_verified?: boolean | undefined;
  is_active?: boolean | undefined;
  provider_uid?: number | null | undefined;
}

/**
 * Hook to fetch all users
 * Authentication handled by middleware via httpOnly cookies
 */
export function useUsers() {
  // Hook called (client-side debug)
  if (process.env.NODE_ENV === 'development') {
    console.log('👥 useUsers: Hook called (auth handled by middleware)');
  }

  const query = useApiQuery<User[]>(['users'], '/api/users?limit=1000', {
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Query state logging (client-side debug)
  if (process.env.NODE_ENV === 'development') {
    console.log('👥 useUsers: Query state -', {
      isLoading: query.isLoading,
      hasData: !!query.data,
      hasError: !!query.error,
      errorMessage: query.error?.message,
    });
  }

  return query;
}

/**
 * Hook to fetch a single user by ID
 * Authentication handled by middleware via httpOnly cookies
 */
export function useUser(userId: string) {
  return useApiQuery<User>(['users', userId], `/api/users/${userId}`, {
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to create a new user
 */
export function useCreateUser() {
  return useApiPost<User, CreateUserData>('/api/users');
}

/**
 * Hook to update a user
 */
export function useUpdateUser() {
  return useApiPut<User, { id: string; data: UpdateUserData }>(({ id }) => `/api/users/${id}`);
}

/**
 * Hook to delete a user
 */
export function useDeleteUser() {
  return useApiDelete<void, string>((userId) => `/api/users/${userId}`);
}
