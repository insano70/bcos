import { and, asc, count, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { work_item_type_relationships, work_item_types } from '@/lib/db/schema';
import { log } from '@/lib/logger';
import { BaseRBACService } from '@/lib/rbac/base-service';
import type { UserContext } from '@/lib/types/rbac';
import type { AutoCreateConfig } from '@/lib/validations/work-item-type-relationships';

/**
 * Work Item Type Relationships Service with RBAC
 * Phase 6: Manages parent-child type relationships with auto-creation
 */

export interface WorkItemTypeRelationshipQueryOptions {
  parent_type_id?: string | undefined;
  child_type_id?: string | undefined;
  is_required?: boolean | undefined;
  auto_create?: boolean | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

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

export class RBACWorkItemTypeRelationshipsService extends BaseRBACService {
  /**
   * Get work item type relationships with filtering
   */
  async getRelationships(
    options: WorkItemTypeRelationshipQueryOptions = {}
  ): Promise<WorkItemTypeRelationshipWithDetails[]> {
    const {
      parent_type_id,
      child_type_id,
      is_required,
      auto_create,
      limit = 50,
      offset = 0,
    } = options;

    const queryStart = Date.now();

    try {
      // Build WHERE conditions
      const conditions = [isNull(work_item_type_relationships.deleted_at)];

      if (parent_type_id) {
        conditions.push(eq(work_item_type_relationships.parent_type_id, parent_type_id));
      }

      if (child_type_id) {
        conditions.push(eq(work_item_type_relationships.child_type_id, child_type_id));
      }

      if (is_required !== undefined) {
        conditions.push(eq(work_item_type_relationships.is_required, is_required));
      }

      if (auto_create !== undefined) {
        conditions.push(eq(work_item_type_relationships.auto_create, auto_create));
      }

      // Create aliases for parent and child types
      const parentType = work_item_types;
      const childType = work_item_types;

      // Execute query with joins
      const results = await db
        .select({
          work_item_type_relationship_id:
            work_item_type_relationships.work_item_type_relationship_id,
          parent_type_id: work_item_type_relationships.parent_type_id,
          parent_type_name: parentType.name,
          parent_type_organization_id: parentType.organization_id,
          child_type_id: work_item_type_relationships.child_type_id,
          child_type_name: childType.name,
          child_type_organization_id: childType.organization_id,
          relationship_name: work_item_type_relationships.relationship_name,
          is_required: work_item_type_relationships.is_required,
          min_count: work_item_type_relationships.min_count,
          max_count: work_item_type_relationships.max_count,
          auto_create: work_item_type_relationships.auto_create,
          auto_create_config: work_item_type_relationships.auto_create_config,
          display_order: work_item_type_relationships.display_order,
          created_at: work_item_type_relationships.created_at,
          updated_at: work_item_type_relationships.updated_at,
        })
        .from(work_item_type_relationships)
        .innerJoin(
          parentType,
          eq(work_item_type_relationships.parent_type_id, parentType.work_item_type_id)
        )
        .innerJoin(
          childType,
          eq(work_item_type_relationships.child_type_id, childType.work_item_type_id)
        )
        .where(and(...conditions))
        .orderBy(
          asc(work_item_type_relationships.display_order),
          asc(work_item_type_relationships.relationship_name)
        )
        .limit(limit)
        .offset(offset);

      log.info('Work item type relationships retrieved', {
        count: results.length,
        duration: Date.now() - queryStart,
      });

      return results.map((row) => ({
        work_item_type_relationship_id: row.work_item_type_relationship_id,
        parent_type_id: row.parent_type_id,
        parent_type_name: row.parent_type_name,
        parent_type_organization_id: row.parent_type_organization_id,
        child_type_id: row.child_type_id,
        child_type_name: row.child_type_name,
        child_type_organization_id: row.child_type_organization_id,
        relationship_name: row.relationship_name,
        is_required: row.is_required,
        min_count: row.min_count,
        max_count: row.max_count,
        auto_create: row.auto_create,
        auto_create_config: row.auto_create_config as AutoCreateConfig | null,
        display_order: row.display_order,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
    } catch (error) {
      log.error('Failed to retrieve work item type relationships', error);
      throw error;
    }
  }

  /**
   * Get total count of relationships
   */
  async getRelationshipCount(options: WorkItemTypeRelationshipQueryOptions = {}): Promise<number> {
    const { parent_type_id, child_type_id, is_required, auto_create } = options;

    try {
      const conditions = [isNull(work_item_type_relationships.deleted_at)];

      if (parent_type_id) {
        conditions.push(eq(work_item_type_relationships.parent_type_id, parent_type_id));
      }

      if (child_type_id) {
        conditions.push(eq(work_item_type_relationships.child_type_id, child_type_id));
      }

      if (is_required !== undefined) {
        conditions.push(eq(work_item_type_relationships.is_required, is_required));
      }

      if (auto_create !== undefined) {
        conditions.push(eq(work_item_type_relationships.auto_create, auto_create));
      }

      const [result] = await db
        .select({ count: count() })
        .from(work_item_type_relationships)
        .where(and(...conditions));

      return result?.count || 0;
    } catch (error) {
      log.error('Failed to count work item type relationships', error);
      throw error;
    }
  }

  /**
   * Get relationship by ID
   */
  async getRelationshipById(
    relationshipId: string
  ): Promise<WorkItemTypeRelationshipWithDetails | null> {
    try {
      const parentType = work_item_types;
      const childType = work_item_types;

      const results = await db
        .select({
          work_item_type_relationship_id:
            work_item_type_relationships.work_item_type_relationship_id,
          parent_type_id: work_item_type_relationships.parent_type_id,
          parent_type_name: parentType.name,
          parent_type_organization_id: parentType.organization_id,
          child_type_id: work_item_type_relationships.child_type_id,
          child_type_name: childType.name,
          child_type_organization_id: childType.organization_id,
          relationship_name: work_item_type_relationships.relationship_name,
          is_required: work_item_type_relationships.is_required,
          min_count: work_item_type_relationships.min_count,
          max_count: work_item_type_relationships.max_count,
          auto_create: work_item_type_relationships.auto_create,
          auto_create_config: work_item_type_relationships.auto_create_config,
          display_order: work_item_type_relationships.display_order,
          created_at: work_item_type_relationships.created_at,
          updated_at: work_item_type_relationships.updated_at,
        })
        .from(work_item_type_relationships)
        .innerJoin(
          parentType,
          eq(work_item_type_relationships.parent_type_id, parentType.work_item_type_id)
        )
        .innerJoin(
          childType,
          eq(work_item_type_relationships.child_type_id, childType.work_item_type_id)
        )
        .where(
          and(
            eq(work_item_type_relationships.work_item_type_relationship_id, relationshipId),
            isNull(work_item_type_relationships.deleted_at)
          )
        )
        .limit(1);

      const row = results[0];
      if (!row) {
        return null;
      }

      return {
        work_item_type_relationship_id: row.work_item_type_relationship_id,
        parent_type_id: row.parent_type_id,
        parent_type_name: row.parent_type_name,
        parent_type_organization_id: row.parent_type_organization_id,
        child_type_id: row.child_type_id,
        child_type_name: row.child_type_name,
        child_type_organization_id: row.child_type_organization_id,
        relationship_name: row.relationship_name,
        is_required: row.is_required,
        min_count: row.min_count,
        max_count: row.max_count,
        auto_create: row.auto_create,
        auto_create_config: row.auto_create_config as AutoCreateConfig | null,
        display_order: row.display_order,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    } catch (error) {
      log.error('Failed to retrieve work item type relationship', error, {
        relationshipId,
      });
      throw error;
    }
  }

  /**
   * Create a new work item type relationship
   * Phase 6: Type relationships with auto-creation
   */
  async createRelationship(data: {
    parent_type_id: string;
    child_type_id: string;
    relationship_name: string;
    is_required?: boolean;
    min_count?: number;
    max_count?: number;
    auto_create?: boolean;
    auto_create_config?: AutoCreateConfig;
    display_order?: number;
  }): Promise<WorkItemTypeRelationshipWithDetails> {
    const startTime = Date.now();

    log.info('Work item type relationship creation initiated', {
      requestingUserId: this.userContext.user_id,
      parentTypeId: data.parent_type_id,
      childTypeId: data.child_type_id,
      operation: 'create_relationship',
    });

    // Get parent type to check organization
    const [parentType] = await db
      .select({
        work_item_type_id: work_item_types.work_item_type_id,
        organization_id: work_item_types.organization_id,
      })
      .from(work_item_types)
      .where(
        and(
          eq(work_item_types.work_item_type_id, data.parent_type_id),
          isNull(work_item_types.deleted_at)
        )
      )
      .limit(1);

    if (!parentType) {
      throw new Error('Parent type not found');
    }

    // Get child type to check organization
    const [childType] = await db
      .select({
        work_item_type_id: work_item_types.work_item_type_id,
        organization_id: work_item_types.organization_id,
      })
      .from(work_item_types)
      .where(
        and(
          eq(work_item_types.work_item_type_id, data.child_type_id),
          isNull(work_item_types.deleted_at)
        )
      )
      .limit(1);

    if (!childType) {
      throw new Error('Child type not found');
    }

    // Both types must belong to the same organization (or both be global)
    if (parentType.organization_id !== childType.organization_id) {
      throw new Error('Parent and child types must belong to the same organization');
    }

    // Check permission - require manage permission for the organization
    if (parentType.organization_id) {
      this.requirePermission(
        'work-items:manage:organization',
        undefined,
        parentType.organization_id
      );
      this.requireOrganizationAccess(parentType.organization_id);
    } else {
      // Global types - require admin
      this.requirePermission('work-items:manage:all');
    }

    // Check for existing relationship (prevent duplicates)
    const existingRelationships = await db
      .select({
        work_item_type_relationship_id: work_item_type_relationships.work_item_type_relationship_id,
      })
      .from(work_item_type_relationships)
      .where(
        and(
          eq(work_item_type_relationships.parent_type_id, data.parent_type_id),
          eq(work_item_type_relationships.child_type_id, data.child_type_id),
          isNull(work_item_type_relationships.deleted_at)
        )
      )
      .limit(1);

    if (existingRelationships.length > 0) {
      throw new Error('A relationship already exists between these parent and child types');
    }

    try {
      const [newRelationship] = await db
        .insert(work_item_type_relationships)
        .values({
          parent_type_id: data.parent_type_id,
          child_type_id: data.child_type_id,
          relationship_name: data.relationship_name,
          is_required: data.is_required ?? false,
          min_count: data.min_count || null,
          max_count: data.max_count || null,
          auto_create: data.auto_create ?? false,
          auto_create_config: data.auto_create_config
            ? (data.auto_create_config as unknown as Record<string, unknown>)
            : null,
          display_order: data.display_order ?? 0,
        })
        .returning();

      if (!newRelationship) {
        throw new Error('Failed to create work item type relationship');
      }

      log.info('Work item type relationship created successfully', {
        relationshipId: newRelationship.work_item_type_relationship_id,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
      });

      // Return full details
      const relationshipWithDetails = await this.getRelationshipById(
        newRelationship.work_item_type_relationship_id
      );
      if (!relationshipWithDetails) {
        throw new Error('Failed to retrieve created relationship');
      }

      return relationshipWithDetails;
    } catch (error) {
      log.error('Failed to create work item type relationship', error, {
        parentTypeId: data.parent_type_id,
        childTypeId: data.child_type_id,
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * Update a work item type relationship
   * Phase 6: Type relationships with auto-creation
   */
  async updateRelationship(
    relationshipId: string,
    data: {
      relationship_name?: string;
      is_required?: boolean;
      min_count?: number | null;
      max_count?: number | null;
      auto_create?: boolean;
      auto_create_config?: AutoCreateConfig | null;
      display_order?: number;
    }
  ): Promise<WorkItemTypeRelationshipWithDetails> {
    const startTime = Date.now();

    log.info('Work item type relationship update initiated', {
      requestingUserId: this.userContext.user_id,
      relationshipId,
      operation: 'update_relationship',
    });

    // Get existing relationship
    const existingRelationship = await this.getRelationshipById(relationshipId);
    if (!existingRelationship) {
      throw new Error('Relationship not found');
    }

    // Check permission based on parent type's organization
    if (existingRelationship.parent_type_organization_id) {
      this.requirePermission(
        'work-items:manage:organization',
        undefined,
        existingRelationship.parent_type_organization_id
      );
      this.requireOrganizationAccess(existingRelationship.parent_type_organization_id);
    } else {
      // Global types - require admin
      this.requirePermission('work-items:manage:all');
    }

    try {
      await db
        .update(work_item_type_relationships)
        .set({
          ...data,
          auto_create_config: data.auto_create_config
            ? (data.auto_create_config as unknown as Record<string, unknown>)
            : undefined,
          updated_at: new Date(),
        })
        .where(eq(work_item_type_relationships.work_item_type_relationship_id, relationshipId));

      log.info('Work item type relationship updated successfully', {
        relationshipId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
      });

      // Return updated details
      const updatedRelationship = await this.getRelationshipById(relationshipId);
      if (!updatedRelationship) {
        throw new Error('Failed to retrieve updated relationship');
      }

      return updatedRelationship;
    } catch (error) {
      log.error('Failed to update work item type relationship', error, {
        relationshipId,
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * Delete (soft delete) a work item type relationship
   * Phase 6: Type relationships with auto-creation
   */
  async deleteRelationship(relationshipId: string): Promise<void> {
    const startTime = Date.now();

    log.info('Work item type relationship deletion initiated', {
      requestingUserId: this.userContext.user_id,
      relationshipId,
      operation: 'delete_relationship',
    });

    // Get existing relationship
    const existingRelationship = await this.getRelationshipById(relationshipId);
    if (!existingRelationship) {
      throw new Error('Relationship not found');
    }

    // Check permission based on parent type's organization
    if (existingRelationship.parent_type_organization_id) {
      this.requirePermission(
        'work-items:manage:organization',
        undefined,
        existingRelationship.parent_type_organization_id
      );
      this.requireOrganizationAccess(existingRelationship.parent_type_organization_id);
    } else {
      // Global types - require admin
      this.requirePermission('work-items:manage:all');
    }

    try {
      // Soft delete
      await db
        .update(work_item_type_relationships)
        .set({
          deleted_at: new Date(),
        })
        .where(eq(work_item_type_relationships.work_item_type_relationship_id, relationshipId));

      log.info('Work item type relationship deleted successfully', {
        relationshipId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
      });
    } catch (error) {
      log.error('Failed to delete work item type relationship', error, {
        relationshipId,
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * Get relationships for a specific parent type
   * Used when creating new work items to determine valid child types
   */
  async getRelationshipsForParentType(
    parentTypeId: string
  ): Promise<WorkItemTypeRelationshipWithDetails[]> {
    return this.getRelationships({ parent_type_id: parentTypeId });
  }

  /**
   * Validate if a child type can be added to a parent work item
   * Checks relationship rules and min/max constraints
   */
  async validateChildTypeForParent(
    parentTypeId: string,
    childTypeId: string,
    currentChildCount: number
  ): Promise<{
    allowed: boolean;
    reason?: string;
    relationship?: WorkItemTypeRelationshipWithDetails;
  }> {
    // Find relationship between parent and child types
    const relationships = await db
      .select()
      .from(work_item_type_relationships)
      .where(
        and(
          eq(work_item_type_relationships.parent_type_id, parentTypeId),
          eq(work_item_type_relationships.child_type_id, childTypeId),
          isNull(work_item_type_relationships.deleted_at)
        )
      )
      .limit(1);

    if (relationships.length === 0) {
      return {
        allowed: false,
        reason: 'This child type is not allowed for this parent type',
      };
    }

    const firstRelationship = relationships[0];
    if (!firstRelationship) {
      return {
        allowed: false,
        reason: 'Relationship not found',
      };
    }

    const relationship = await this.getRelationshipById(
      firstRelationship.work_item_type_relationship_id
    );

    if (!relationship) {
      return {
        allowed: false,
        reason: 'Relationship not found',
      };
    }

    // Check max_count constraint
    if (relationship.max_count !== null && currentChildCount >= relationship.max_count) {
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
  }
}

/**
 * Factory function to create service instance
 */
export function createRBACWorkItemTypeRelationshipsService(userContext: UserContext) {
  return new RBACWorkItemTypeRelationshipsService(userContext);
}
