/**
 * Cleanup Tracker for Test Data
 *
 * Tracks all created test objects and provides coordinated cleanup
 * with dependency ordering to handle foreign key constraints.
 *
 * Features:
 * - Tracks created objects by type and ID
 * - Maintains dependency graph for proper cleanup ordering
 * - Supports scoped cleanup (per-test isolation)
 * - Provides bulk cleanup operations
 * - Thread-safe for parallel test execution
 */

import type { TestEntityType } from './id-generator';

/**
 * Represents a created test object that needs cleanup
 */
export interface TrackedObject {
  /**
   * The unique ID of the object
   */
  id: string;

  /**
   * The type of entity (user, dashboard, etc.)
   */
  type: TestEntityType;

  /**
   * When this object was created
   */
  createdAt: Date;

  /**
   * IDs of objects that depend on this one
   * These must be cleaned up before this object
   */
  dependents: string[];

  /**
   * IDs of objects this one depends on
   * This must be cleaned up before those objects
   */
  dependencies: string[];

  /**
   * Optional scope identifier for isolated cleanup
   */
  scope?: string;

  /**
   * Metadata about the object (for debugging)
   */
  metadata?: Record<string, unknown>;
}

/**
 * Cleanup ordering by entity type
 * Higher numbers are cleaned up first (reverse dependency order)
 */
const CLEANUP_ORDER: Record<TestEntityType, number> = {
  // Most dependent (cleaned up first)
  appointment: 100,
  patient: 90,
  staff: 80,
  chart: 70,
  dashboard: 60,
  practice: 50,
  permission: 40,
  role: 30,
  user: 20,
  organization: 10,
  // Least dependent (cleaned up last)
};

/**
 * Cleanup Tracker class
 */
export class CleanupTracker {
  /**
   * Map of object ID to tracked object
   */
  private readonly objects: Map<string, TrackedObject> = new Map();

  /**
   * Map of scope to object IDs in that scope
   */
  private readonly scopes: Map<string, Set<string>> = new Map();

  /**
   * Lock for thread-safe operations
   */
  private cleanupInProgress = false;

  /**
   * Track a newly created test object
   *
   * @param object - The object to track
   *
   * @example
   * tracker.track({
   *   id: 'test_user_a3k9d2m1',
   *   type: 'user',
   *   createdAt: new Date(),
   *   dependents: [],
   *   dependencies: [],
   *   scope: 'my-test-suite'
   * })
   */
  track(object: TrackedObject): void {
    if (this.objects.has(object.id)) {
      throw new Error(
        `Object ${object.id} is already being tracked. ` +
          `This may indicate a duplicate ID or missing cleanup.`
      );
    }

    this.objects.set(object.id, object);

    // Track by scope if provided
    if (object.scope) {
      if (!this.scopes.has(object.scope)) {
        this.scopes.set(object.scope, new Set());
      }
      this.scopes.get(object.scope)?.add(object.id);
    }
  }

  /**
   * Add a dependency relationship between two objects
   *
   * @param dependentId - ID of object that depends on another
   * @param dependencyId - ID of object that is depended upon
   *
   * @example
   * // Dashboard depends on user (created_by)
   * tracker.addDependency('test_dashboard_x7j2p9w4', 'test_user_a3k9d2m1')
   */
  addDependency(dependentId: string, dependencyId: string): void {
    const dependent = this.objects.get(dependentId);
    const dependency = this.objects.get(dependencyId);

    if (!dependent) {
      throw new Error(`Cannot add dependency: ${dependentId} is not tracked`);
    }

    if (!dependency) {
      // Dependency might be created outside this tracker (e.g., in transaction)
      // This is okay - just don't track the relationship
      return;
    }

    // Add to both sides of relationship
    if (!dependent.dependencies.includes(dependencyId)) {
      dependent.dependencies.push(dependencyId);
    }

    if (!dependency.dependents.includes(dependentId)) {
      dependency.dependents.push(dependentId);
    }
  }

  /**
   * Get all tracked objects in proper cleanup order
   *
   * Returns objects sorted by:
   * 1. Type priority (from CLEANUP_ORDER)
   * 2. Dependency relationships (dependents before dependencies)
   * 3. Creation time (newer before older)
   *
   * @param scope - Optional scope to filter by
   * @returns Array of tracked objects in cleanup order
   */
  getCleanupOrder(scope?: string): TrackedObject[] {
    let objects = Array.from(this.objects.values());

    // Filter by scope if provided
    if (scope) {
      const scopeIds = this.scopes.get(scope);
      if (scopeIds) {
        objects = objects.filter((obj) => scopeIds.has(obj.id));
      }
    }

    // Sort by cleanup priority
    return objects.sort((a, b) => {
      // First, sort by type priority
      const priorityDiff = (CLEANUP_ORDER[b.type] || 0) - (CLEANUP_ORDER[a.type] || 0);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      // Then, ensure dependents come before dependencies
      if (a.dependencies.includes(b.id)) {
        return -1; // a depends on b, clean a first
      }
      if (b.dependencies.includes(a.id)) {
        return 1; // b depends on a, clean b first
      }

      // Finally, sort by creation time (newer first)
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  }

  /**
   * Get all object IDs of a specific type
   *
   * @param type - Entity type to filter by
   * @param scope - Optional scope to filter by
   * @returns Array of object IDs
   */
  getIdsByType(type: TestEntityType, scope?: string): string[] {
    let objects = Array.from(this.objects.values()).filter((obj) => obj.type === type);

    if (scope) {
      const scopeIds = this.scopes.get(scope);
      if (scopeIds) {
        objects = objects.filter((obj) => scopeIds.has(obj.id));
      }
    }

    return objects.map((obj) => obj.id);
  }

  /**
   * Mark an object as cleaned up (remove from tracking)
   *
   * @param id - ID of object that was cleaned up
   */
  markCleaned(id: string): void {
    const object = this.objects.get(id);
    if (!object) {
      return; // Already cleaned or never tracked
    }

    // Remove from scope tracking
    if (object.scope && this.scopes.has(object.scope)) {
      this.scopes.get(object.scope)?.delete(id);
    }

    // Remove from main tracking
    this.objects.delete(id);
  }

  /**
   * Mark multiple objects as cleaned up
   *
   * @param ids - Array of IDs that were cleaned up
   */
  markManyCleaned(ids: string[]): void {
    for (const id of ids) {
      this.markCleaned(id);
    }
  }

  /**
   * Get count of tracked objects
   *
   * @param scope - Optional scope to filter by
   * @returns Number of tracked objects
   */
  getCount(scope?: string): number {
    if (scope && this.scopes.has(scope)) {
      return this.scopes.get(scope)?.size ?? 0;
    }
    return this.objects.size;
  }

  /**
   * Check if cleanup is currently in progress
   * Used to prevent concurrent cleanup operations
   */
  isCleanupInProgress(): boolean {
    return this.cleanupInProgress;
  }

  /**
   * Set cleanup in progress flag
   */
  setCleanupInProgress(inProgress: boolean): void {
    this.cleanupInProgress = inProgress;
  }

  /**
   * Get all active scopes
   */
  getScopes(): string[] {
    return Array.from(this.scopes.keys());
  }

  /**
   * Clear all tracking data
   * WARNING: Use only for testing the tracker itself
   */
  reset(): void {
    this.objects.clear();
    this.scopes.clear();
    this.cleanupInProgress = false;
  }

  /**
   * Get debug information about tracked objects
   */
  getDebugInfo(): {
    totalObjects: number;
    byType: Record<string, number>;
    byScope: Record<string, number>;
    objectsWithDependents: number;
    objectsWithDependencies: number;
  } {
    const byType: Record<string, number> = {};
    const byScope: Record<string, number> = {};
    let objectsWithDependents = 0;
    let objectsWithDependencies = 0;

    const objects = Array.from(this.objects.values());
    for (const obj of objects) {
      // Count by type
      byType[obj.type] = (byType[obj.type] || 0) + 1;

      // Count by scope
      if (obj.scope) {
        byScope[obj.scope] = (byScope[obj.scope] || 0) + 1;
      }

      // Count dependencies
      if (obj.dependents.length > 0) {
        objectsWithDependents++;
      }
      if (obj.dependencies.length > 0) {
        objectsWithDependencies++;
      }
    }

    return {
      totalObjects: this.objects.size,
      byType,
      byScope,
      objectsWithDependents,
      objectsWithDependencies,
    };
  }
}

/**
 * Singleton instance for default usage
 */
export const defaultCleanupTracker = new CleanupTracker();
