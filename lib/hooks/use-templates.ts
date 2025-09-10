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
  const response = await fetch('/api/templates');
  if (!response.ok) {
    throw new Error('Failed to fetch templates');
  }
  return response.json();
}

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: fetchTemplates,
    staleTime: 10 * 60 * 1000, // 10 minutes (templates don't change often)
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}
