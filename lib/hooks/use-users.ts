import { useQuery } from '@tanstack/react-query';

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

async function fetchUsers(): Promise<User[]> {
  const response = await fetch('/api/users');
  if (!response.ok) {
    throw new Error('Failed to fetch users');
  }
  const result = await response.json();
  
  // Handle the standardized API response format
  if (result.success && Array.isArray(result.data)) {
    return result.data;
  }
  
  // Fallback for direct array response
  if (Array.isArray(result)) {
    return result;
  }
  
  throw new Error('Invalid response format from users API');
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}
