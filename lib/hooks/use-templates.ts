import { useQuery } from '@tanstack/react-query';

export interface Template {
  id: string; // Maps to template_id in database
  name: string;
  slug: string;
  description: string;
  preview_image_url: string | null;
  is_active: boolean;
  created_at: string;
}

async function fetchTemplates(): Promise<Template[]> {
  const response = await fetch('/api/templates', {
    credentials: 'include'
  });
  if (!response.ok) {
    throw new Error('Failed to fetch templates');
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
  
  throw new Error('Invalid response format from templates API');
}

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: fetchTemplates,
    staleTime: 10 * 60 * 1000, // 10 minutes (templates don't change often)
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}
