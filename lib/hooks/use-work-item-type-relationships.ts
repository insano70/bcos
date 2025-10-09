import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type {
  WorkItemTypeRelationshipCreate,
  WorkItemTypeRelationshipUpdate,
} from '@/lib/validations/work-item-type-relationships';

/**
 * React Query hooks for Work Item Type Relationships
 * Phase 6: Type relationships with auto-creation
 */

export interface WorkItemTypeRelationship {
  work_item_type_relationship_id: string;
  parent_type_id: string;
  parent_type_name: string;
  parent_type_organization_id: string | null;
  child_type_id: string;
  child_type_name: string;
  child_type_organization_id: string | null;
  relationship_name: string;
  is_required: boolean;
  min_count: number | null;
  max_count: number | null;
  auto_create: boolean;
  auto_create_config: {
    subject_template?: string;
    field_values?: Record<string, string>;
    inherit_fields?: string[];
  } | null;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

interface TypeRelationshipsQueryParams {
  parent_type_id?: string;
  child_type_id?: string;
  is_required?: boolean;
  auto_create?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Fetch all type relationships with optional filtering
 */
export function useWorkItemTypeRelationships(params?: TypeRelationshipsQueryParams) {
  return useQuery<WorkItemTypeRelationship[], Error>({
    queryKey: ['work-item-type-relationships', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            searchParams.append(key, String(value));
          }
        });
      }
      const url = `/api/work-item-type-relationships${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
      const data = await apiClient.get<WorkItemTypeRelationship[]>(url);
      return data;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes (relationships change infrequently)
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Fetch relationships for a specific work item type (as parent)
 * Used when displaying valid child types for a parent type
 */
export function useTypeRelationshipsForParent(parentTypeId: string | undefined) {
  return useQuery<WorkItemTypeRelationship[], Error>({
    queryKey: ['work-item-type-relationships', 'parent', parentTypeId],
    queryFn: async () => {
      if (!parentTypeId) throw new Error('Parent type ID is required');
      return await apiClient.get<WorkItemTypeRelationship[]>(
        `/api/work-item-types/${parentTypeId}/relationships`
      );
    },
    enabled: !!parentTypeId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Fetch a single type relationship by ID
 */
export function useWorkItemTypeRelationship(id: string | undefined) {
  return useQuery<WorkItemTypeRelationship, Error>({
    queryKey: ['work-item-type-relationship', id],
    queryFn: async () => {
      if (!id) throw new Error('Relationship ID is required');
      return await apiClient.get<WorkItemTypeRelationship>(
        `/api/work-item-type-relationships/${id}`
      );
    },
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Create a new type relationship
 * Phase 6: Type relationships with auto-creation
 */
export function useCreateTypeRelationship() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: WorkItemTypeRelationshipCreate) => {
      return await apiClient.post<WorkItemTypeRelationship>(
        `/api/work-item-types/${data.parent_type_id}/relationships`,
        data
      );
    },
    onSuccess: (_, variables) => {
      // Invalidate all relationship queries
      queryClient.invalidateQueries({ queryKey: ['work-item-type-relationships'] });
      // Specifically invalidate the parent type's relationships
      queryClient.invalidateQueries({
        queryKey: ['work-item-type-relationships', 'parent', variables.parent_type_id],
      });
    },
  });
}

/**
 * Update an existing type relationship
 * Phase 6: Type relationships with auto-creation
 */
export function useUpdateTypeRelationship() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: WorkItemTypeRelationshipUpdate;
    }) => {
      return await apiClient.patch<WorkItemTypeRelationship>(
        `/api/work-item-type-relationships/${id}`,
        data
      );
    },
    onSuccess: (result, variables) => {
      // Invalidate all relationship queries
      queryClient.invalidateQueries({ queryKey: ['work-item-type-relationships'] });
      // Invalidate specific relationship
      queryClient.invalidateQueries({
        queryKey: ['work-item-type-relationship', variables.id],
      });
      // Invalidate parent type's relationships
      queryClient.invalidateQueries({
        queryKey: ['work-item-type-relationships', 'parent', result.parent_type_id],
      });
    },
  });
}

/**
 * Delete a type relationship (soft delete)
 * Phase 6: Type relationships with auto-creation
 */
export function useDeleteTypeRelationship() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return await apiClient.delete(`/api/work-item-type-relationships/${id}`);
    },
    onSuccess: (_, id) => {
      // Invalidate all relationship queries
      queryClient.invalidateQueries({ queryKey: ['work-item-type-relationships'] });
      // Invalidate specific relationship
      queryClient.invalidateQueries({ queryKey: ['work-item-type-relationship', id] });
    },
  });
}

/**
 * Validate if a child type can be added to a parent work item
 * Checks relationship rules and constraints
 */
export function useValidateChildType() {
  return useMutation({
    mutationFn: async ({
      parentTypeId,
      childTypeId,
      currentChildCount,
    }: {
      parentTypeId: string;
      childTypeId: string;
      currentChildCount: number;
    }) => {
      // This would call a validation endpoint if we create one
      // For now, we'll fetch relationships and validate client-side
      const relationships = await apiClient.get<WorkItemTypeRelationship[]>(
        `/api/work-item-types/${parentTypeId}/relationships?child_type_id=${childTypeId}`
      );

      if (relationships.length === 0) {
        return {
          allowed: false,
          reason: 'This child type is not allowed for this parent type',
        };
      }

      const relationship = relationships[0];
      if (!relationship) {
        return {
          allowed: false,
          reason: 'Relationship not found',
        };
      }

      if (
        relationship.max_count !== null &&
        currentChildCount >= relationship.max_count
      ) {
        return {
          allowed: false,
          reason: `Maximum number of ${relationship.child_type_name} items (${relationship.max_count}) reached`,
          relationship,
        };
      }

      return {
        allowed: true,
        relationship,
      };
    },
  });
}
