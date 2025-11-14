'use client';

import { useEffect, useState } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { Practice, PracticeAttributes } from '@/lib/types/practice';
import type { PracticeFormData } from '../types';
import { practiceConfigSchema } from '@/lib/validations/practice-form';
import { DEFAULT_BUSINESS_HOURS } from '@/lib/constants/practice';

interface UsePracticeConfigFormOptions {
  practice: Practice;
  initialAttributes: PracticeAttributes;
}

interface UsePracticeConfigFormReturn {
  form: UseFormReturn<PracticeFormData>;
  attributes: PracticeAttributes | undefined;
  isLoading: boolean;
  currentPractice: Practice;
  setCurrentPractice: React.Dispatch<React.SetStateAction<Practice>>;
}

/**
 * Fetch practice attributes from API
 */
async function fetchPracticeAttributes(practiceId: string): Promise<PracticeAttributes> {
  const response = await apiClient.get<PracticeAttributes>(
    `/api/practices/${practiceId}/attributes`
  );

  // apiClient already unwraps the response, so response is the data itself
  return response;
}

/**
 * Map practice attributes to form data with default values
 */
function mapAttributesToFormData(
  attributes: PracticeAttributes,
  practice: Practice
): PracticeFormData {
  return {
    // Practice core
    name: practice.name || '',
    template_id: practice.template_id || '',

    // Contact info
    phone: attributes.phone || '',
    email: attributes.email || '',
    address_line1: attributes.address_line1 || '',
    address_line2: attributes.address_line2 || '',
    city: attributes.city || '',
    state: attributes.state || '',
    zip_code: attributes.zip_code || '',

    // Content
    about_text: attributes.about_text || '',
    mission_statement: attributes.mission_statement || '',
    welcome_message: attributes.welcome_message || '',

    // Arrays
    services: attributes.services || [],
    conditions_treated: attributes.conditions_treated || [],

    // Business hours with defaults
    business_hours: attributes.business_hours || DEFAULT_BUSINESS_HOURS,

    // Images
    logo_url: attributes.logo_url || '',
    hero_image_url: attributes.hero_image_url || '',
    hero_overlay_opacity: attributes.hero_overlay_opacity ?? 0.1,
    gallery_images: attributes.gallery_images || [],

    // SEO
    meta_title: attributes.meta_title || '',
    meta_description: attributes.meta_description || '',

    // Brand colors with defaults
    primary_color: attributes.primary_color || '#00AEEF',
    secondary_color: attributes.secondary_color || '#FFFFFF',
    accent_color: attributes.accent_color || '#44C0AE',

    // Clinect Ratings Integration
    practice_slug: attributes.practice_slug || '',
    ratings_feed_enabled: attributes.ratings_feed_enabled || false,
  };
}

/**
 * Hook for managing practice configuration form state
 * Handles data fetching, form initialization, and automatic reset on data changes
 */
export function usePracticeConfigForm({
  practice,
  initialAttributes,
}: UsePracticeConfigFormOptions): UsePracticeConfigFormReturn {
  const practiceId = practice.practice_id;

  // Track current practice state (for name/template changes)
  const [currentPractice, setCurrentPractice] = useState(practice);

  // Fetch practice attributes with React Query
  const { data: attributes, isLoading } = useQuery({
    queryKey: ['practice-attributes', practiceId],
    queryFn: () => fetchPracticeAttributes(practiceId),
    enabled: !!practiceId,
    initialData: initialAttributes,
  });

  // Initialize react-hook-form with Zod validation
  const form = useForm({
    resolver: zodResolver(practiceConfigSchema),
    defaultValues: mapAttributesToFormData(initialAttributes, practice),
    mode: 'onBlur', // Validate on blur for better UX
  }) as UseFormReturn<PracticeFormData>;

  // Reset form when attributes or practice data changes
  useEffect(() => {
    if (attributes) {
      const formData = mapAttributesToFormData(attributes, currentPractice);
      form.reset(formData);
    }
  }, [attributes, currentPractice, form]);

  return {
    form,
    attributes,
    isLoading,
    currentPractice,
    setCurrentPractice,
  };
}
