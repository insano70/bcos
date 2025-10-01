/**
 * Factory Registry for Centralized Test Data Management
 *
 * Provides a centralized registry for all test data factories with:
 * - Scoped cleanup (per-test isolation)
 * - Global cleanup (cleanup all test data)
 * - Dependency-aware cleanup ordering
 * - Factory lifecycle management
 *
 * The registry ensures test data is cleaned up in the correct order
 * to handle foreign key constraints.
 */

import { defaultCleanupTracker } from './cleanup-tracker'
import { defaultIDGenerator } from './id-generator'
import type { BaseFactory, BaseFactoryOptions } from './base-factory'

/**
 * Scoped factory collection for isolated test data
 */
export interface FactoryScope {
  /**
   * Unique identifier for this scope
   */
  scopeId: string

  /**
   * Factories in this scope
   */
  factories: Map<string, BaseFactory<{ [key: string]: unknown }, BaseFactoryOptions>>

  /**
   * When this scope was created
   */
  createdAt: Date

  /**
   * Metadata about this scope
   */
  metadata: Record<string, unknown> | undefined
}

/**
 * Factory Registry
 *
 * Manages all test data factories and coordinates cleanup.
 *
 * @example
 * ```typescript
 * // Create a scoped registry for a test suite
 * const registry = FactoryRegistry.createScope('my-test-suite')
 *
 * // Use factories through the registry
 * const user = await registry.users.create({ scope: 'my-test-suite' })
 * const dashboard = await registry.dashboards.create({
 *   created_by: user.user_id,
 *   scope: 'my-test-suite'
 * })
 *
 * // Cleanup all data for this scope
 * await registry.cleanup()
 * ```
 */
export class FactoryRegistry {
  private static scopes: Map<string, FactoryScope> = new Map()
  private static globalFactories: Map<string, BaseFactory<{ [key: string]: unknown }, BaseFactoryOptions>> = new Map()

  /**
   * Register a factory globally
   *
   * @param name - Factory name (e.g., 'user', 'dashboard')
   * @param factory - The factory instance
   */
  static registerFactory(
    name: string,
    factory: BaseFactory<{ [key: string]: unknown }, BaseFactoryOptions>
  ): void {
    this.globalFactories.set(name, factory)
  }

  /**
   * Get a globally registered factory
   *
   * @param name - Factory name
   * @returns The factory instance
   */
  static getFactory<T extends BaseFactory<{ [key: string]: unknown }, BaseFactoryOptions>>(name: string): T | undefined {
    return this.globalFactories.get(name) as T | undefined
  }

  /**
   * Create a new scoped factory collection
   *
   * @param scopeId - Unique identifier for this scope
   * @param metadata - Optional metadata
   * @returns A scoped factory collection
   */
  static createScope(
    scopeId: string,
    metadata?: Record<string, unknown>
  ): ScopedFactoryCollection {
    if (this.scopes.has(scopeId)) {
      throw new Error(
        `Scope ${scopeId} already exists. ` +
        `Each test should use a unique scope ID or cleanup the previous scope first.`
      )
    }

    const scope: FactoryScope = {
      scopeId,
      factories: new Map(),
      createdAt: new Date(),
      metadata: metadata ?? undefined
    }

    this.scopes.set(scopeId, scope)

    return new ScopedFactoryCollection(scopeId)
  }

  /**
   * Remove a scope from tracking
   * Called automatically after cleanup
   */
  static removeScope(scopeId: string): void {
    this.scopes.delete(scopeId)
  }

  /**
   * Cleanup a specific scope
   *
   * @param scopeId - The scope to cleanup
   * @returns Number of objects cleaned up
   */
  static async cleanupScope(scopeId: string): Promise<number> {
    const scope = this.scopes.get(scopeId)
    if (!scope) {
      return 0
    }

    // Get cleanup order from tracker
    const cleanupOrder = defaultCleanupTracker.getCleanupOrder(scopeId)

    let totalCleaned = 0

    // Process each type in order
    const processedTypes = new Set<string>()

    for (const obj of cleanupOrder) {
      if (processedTypes.has(obj.type)) {
        continue
      }

      processedTypes.add(obj.type)

      // Find factory for this type
      const factory = Array.from(this.globalFactories.values()).find(
        f => (f as BaseFactory<{ [key: string]: unknown }, BaseFactoryOptions>)['entityType'] === obj.type
      )

      if (factory) {
        const cleaned = await factory.cleanup(scopeId)
        totalCleaned += cleaned
      }
    }

    // Remove scope after cleanup
    this.removeScope(scopeId)

    return totalCleaned
  }

  /**
   * Cleanup all scopes
   * WARNING: This cleans up ALL test data across ALL scopes
   *
   * @returns Number of objects cleaned up
   */
  static async cleanupAll(): Promise<number> {
    let totalCleaned = 0

    for (const scopeId of Array.from(this.scopes.keys())) {
      const cleaned = await this.cleanupScope(scopeId)
      totalCleaned += cleaned
    }

    return totalCleaned
  }

  /**
   * Get all active scope IDs
   */
  static getActiveScopeIds(): string[] {
    return Array.from(this.scopes.keys())
  }

  /**
   * Get debug information about the registry
   */
  static getDebugInfo(): {
    activeScopeCount: number
    registeredFactoryCount: number
    cleanupTrackerInfo: ReturnType<typeof defaultCleanupTracker.getDebugInfo>
  } {
    return {
      activeScopeCount: this.scopes.size,
      registeredFactoryCount: this.globalFactories.size,
      cleanupTrackerInfo: defaultCleanupTracker.getDebugInfo()
    }
  }

  /**
   * Reset the registry (for testing the registry itself)
   * WARNING: Does not perform cleanup, just clears tracking
   */
  static reset(): void {
    this.scopes.clear()
    this.globalFactories.clear()
  }
}

/**
 * Scoped Factory Collection
 *
 * Provides access to factories with automatic scope management.
 * All created objects are automatically tagged with this scope.
 */
export class ScopedFactoryCollection {
  constructor(private readonly scopeId: string) {}

  /**
   * Get a factory with automatic scope injection
   *
   * @param factoryName - Name of the factory
   * @returns Factory with scope pre-configured
   */
  getFactory<T extends BaseFactory<{ [key: string]: unknown }, BaseFactoryOptions>>(
    factoryName: string
  ): T | undefined {
    const factory = FactoryRegistry.getFactory<T>(factoryName)
    if (!factory) {
      return undefined
    }

    // Set default scope on the factory
    factory.setDefaultScope(this.scopeId)

    return factory
  }

  /**
   * Cleanup all data for this scope
   *
   * @returns Number of objects cleaned up
   */
  async cleanup(): Promise<number> {
    return await FactoryRegistry.cleanupScope(this.scopeId)
  }

  /**
   * Get the scope ID
   */
  getScopeId(): string {
    return this.scopeId
  }
}

/**
 * Global cleanup helper for afterAll hooks
 *
 * @example
 * ```typescript
 * afterAll(async () => {
 *   await globalCleanup()
 * })
 * ```
 */
export async function globalCleanup(): Promise<number> {
  return await FactoryRegistry.cleanupAll()
}

/**
 * Create a scoped factory collection for a test
 *
 * @example
 * ```typescript
 * describe('My Test Suite', () => {
 *   const scope = createTestScope('my-test-suite')
 *
 *   afterEach(async () => {
 *     await scope.cleanup()
 *   })
 * })
 * ```
 */
export function createTestScope(
  scopeId: string,
  metadata?: Record<string, unknown>
): ScopedFactoryCollection {
  return FactoryRegistry.createScope(scopeId, metadata)
}
