/**
 * Work Item Type Relationships Types
 * Phase 6: Types for parent-child type relationships with auto-creation
 */

import type { AutoCreateConfig } from '@/lib/validations/work-item-type-relationships';

/**
 * Work item type relationship with full details including parent and child type names
 */
export interface WorkItemTypeRelationshipWithDetails {
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
  auto_create_config: AutoCreateConfig | null;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * Validation result for child type creation
 */
export interface ChildTypeValidationResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Create relationship data
 */
export interface CreateRelationshipData {
  parent_type_id: string;
  child_type_id: string;
  relationship_name: string;
  is_required?: boolean;
  min_count?: number;
  max_count?: number;
  auto_create?: boolean;
  auto_create_config?: AutoCreateConfig;
  display_order?: number;
}

/**
 * Update relationship data
 */
export interface UpdateRelationshipData {
  relationship_name?: string;
  is_required?: boolean;
  min_count?: number;
  max_count?: number;
  auto_create?: boolean;
  auto_create_config?: AutoCreateConfig;
  display_order?: number;
}
