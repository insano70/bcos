'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/rbac-auth-provider';
import { apiClient } from '@/lib/api/client';
import type { SuccessResponse } from '@/lib/api/responses/success';
import type { PracticeAttributes } from '@/lib/types/practice';
import type { PracticeFormData } from '../types';

interface UsePracticeMutationsOptions {
  practiceId: string;
  currentPracticeName: string;
  currentTemplateId: string;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

interface PracticeMutationResult {
  mutateAsync: (data: PracticeFormData) => Promise<SuccessResponse<PracticeAttributes>>;
  isPending: boolean;
  error: Error | null;
}

/**
 * Hook for handling practice configuration mutations
 * Orchestrates dual API calls: practice core (name/template) + attributes
 * Manages CSRF tokens and cache invalidation
 */
export function usePracticeMutations({
  practiceId,
  currentPracticeName,
  currentTemplateId,
  onSuccess,
  onError,
}: UsePracticeMutationsOptions): PracticeMutationResult {
  const queryClient = useQueryClient();
  const { ensureCsrfToken } = useAuth();

  const mutation = useMutation({
    mutationFn: async (data: PracticeFormData) => {
      // Get CSRF token once for all API calls
      await ensureCsrfToken();

      // 1. Determine if practice core fields changed
      const practiceChanges: Partial<Pick<PracticeFormData, 'name' | 'template_id'>> = {};
      if (data.name !== currentPracticeName) {
        practiceChanges.name = data.name;
      }
      if (data.template_id !== currentTemplateId) {
        practiceChanges.template_id = data.template_id;
      }

      // 2. Update practice core (name, template) if changed
      if (Object.keys(practiceChanges).length > 0) {
        await apiClient.put(`/api/practices/${practiceId}`, practiceChanges);
      }

      // 3. Update attributes (exclude name and template_id which are handled separately)
      const { name: _name, template_id: _template_id, ...attributesData } = data;

      // Clean the data - convert empty strings to undefined for optional fields
      const cleanedData = Object.fromEntries(
        Object.entries(attributesData).map(([key, value]) => [
          key,
          value === '' ? undefined : value,
        ])
      );

      // Remove undefined values to avoid sending them
      const filteredData = Object.fromEntries(
        Object.entries(cleanedData).filter(([_, value]) => value !== undefined)
      );

      // Debug logging
      if (process.env.NODE_ENV === 'development') {
        console.log('[usePracticeMutations] Sending to API:', {
          hasHeroOverlayOpacity: 'hero_overlay_opacity' in filteredData,
          heroOverlayOpacityValue: filteredData.hero_overlay_opacity,
          filteredDataKeys: Object.keys(filteredData),
        });
      }

      // 4. Make the API call for attributes
      const result = await apiClient.put<SuccessResponse<PracticeAttributes>>(
        `/api/practices/${practiceId}/attributes`,
        filteredData
      );

      return result;
    },

    // Optimistic update: update cache immediately before server responds
    onMutate: async (newData: PracticeFormData) => {
      // Cancel any outgoing refetches to prevent them from overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: ['practice-attributes', practiceId] });

      // Snapshot the previous value for rollback
      const previousAttributes = queryClient.getQueryData<PracticeAttributes>([
        'practice-attributes',
        practiceId,
      ]);

      // Optimistically update the cache with new data
      if (previousAttributes) {
        const { name: _name, template_id: _template_id, ...attributesOnly } = newData;

        // Merge new attributes with existing data (type-safe)
        // Using Object.assign to handle exactOptionalPropertyTypes correctly
        const optimisticData = {
          ...previousAttributes,
          ...attributesOnly,
        } as PracticeAttributes;

        queryClient.setQueryData<PracticeAttributes>(
          ['practice-attributes', practiceId],
          optimisticData
        );
      }

      // Return context with previous data for rollback
      return { previousAttributes };
    },

    onSuccess: (result) => {
      // Extract actual data from API response
      const actualData = result.data || result;

      // Replace optimistic update with actual server response
      queryClient.setQueryData(['practice-attributes', practiceId], actualData);

      // Invalidate practices list to refresh name/template changes
      queryClient.invalidateQueries({ queryKey: ['practices'] });

      // Call optional success callback
      onSuccess?.();
    },

    onError: (error: Error, _variables, context) => {
      // Rollback to previous state on error
      if (context?.previousAttributes) {
        queryClient.setQueryData(
          ['practice-attributes', practiceId],
          context.previousAttributes
        );
      }

      // Call optional error callback
      onError?.(error);
    },

    // Always refetch after mutation to ensure consistency
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['practice-attributes', practiceId] });
    },
  });

  return {
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error,
  };
}
