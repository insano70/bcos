import { useApiQuery, useApiPost, useApiPut, useApiDelete } from './use-api';

export interface User {
  id: string; // Maps to user_id in database
  first_name: string;
  last_name: string;
  email: string;
  email_verified: boolean | null;
  is_active: boolean | null;
  created_at: string;
  deleted_at: string | null;
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
  first_name?: string;
  last_name?: string;
  email?: string;
  email_verified?: boolean;
  is_active?: boolean;
}

/**
 * Hook to fetch all users
 */
export function useUsers() {
  return useApiQuery<User[]>(
    ['users'],
    '/api/users',
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
    }
  );
}

/**
 * Hook to fetch a single user by ID
 */
export function useUser(userId: string) {
  return useApiQuery<User>(
    ['users', userId],
    `/api/users/${userId}`,
    {
      enabled: !!userId,
      staleTime: 5 * 60 * 1000,
    }
  );
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
  return useApiPut<User, { id: string; data: UpdateUserData }>(
    ({ id }) => `/api/users/${id}`
  );
}

/**
 * Hook to delete a user
 */
export function useDeleteUser() {
  return useApiDelete<void, string>(
    (userId) => `/api/users/${userId}`
  );
}
