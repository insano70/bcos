import { useQuery } from '@tanstack/react-query';

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

async function fetchPractices(): Promise<Practice[]> {
  const response = await fetch('/api/practices');
  if (!response.ok) {
    throw new Error('Failed to fetch practices');
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
  
  throw new Error('Invalid response format from practices API');
}

export function usePractices() {
  return useQuery({
    queryKey: ['practices'],
    queryFn: fetchPractices,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}
