/**
 * Base Factory for Test Data Creation
 *
 * Abstract base class that all test data factories extend.
 * Provides common functionality for:
 * - Cryptographic ID generation
 * - Automatic cleanup tracking
 * - Lifecycle hooks
 * - Dependency management
 * - Scope isolation
 *
 * Factories extending this class create data in COMMITTED transactions,
 * making the data visible to services using the global db connection.
 */

import { db } from '@/lib/db';
import type { CleanupTracker, TrackedObject } from './cleanup-tracker';
import type { IDGenerator, TestEntityType } from './id-generator';

/**
 * Environment check - factories only work in test environment
 */
if (process.env.NODE_ENV !== 'test') {
  throw new Error(
    'Test factories can only be used in test environment. ' +
      'This is a safety mechanism to prevent accidental use in production.'
  );
}

/**
 * Base options for all factory operations
 */
export interface BaseFactoryOptions {
  /**
   * Optional scope identifier for isolated cleanup
   * If provided, this object can be cleaned up with just this scope
   */
  scope?: string;

  /**
   * Optional metadata for debugging
   */
  metadata?: Record<string, unknown>;
}

/**
 * Result of a factory create operation
 */
export interface FactoryCreateResult<T> {
  /**
   * The created object
   */
  data: T;

  /**
   * The ID that was generated/used
   */
  id: string;

  /**
   * The type of entity
   */
  type: TestEntityType;

  /**
   * Whether this object is being tracked for cleanup
   */
  tracked: boolean;
}

/**
 * Lifecycle hooks that factories can implement
 */
export interface FactoryLifecycleHooks<TData, TOptions> {
  /**
   * Called before an object is created
   * Can modify options or perform validation
   *
   * @param options - The options passed to create()
   * @returns Modified options or void
   */
  beforeCreate?(options: TOptions): Promise<TOptions | undefined>;

  /**
   * Called after an object is created
   * Can perform additional setup (e.g., create related objects)
   *
   * @param data - The created object
   * @param options - The options used to create it
   */
  afterCreate?(data: TData, options: TOptions): Promise<void>;

  /**
   * Called before cleanup of objects
   * Can perform pre-cleanup tasks
   *
   * @param ids - IDs about to be cleaned up
   */
  beforeCleanup?(ids: string[]): Promise<void>;

  /**
   * Called after cleanup of objects
   * Can verify cleanup or perform additional cleanup
   *
   * @param ids - IDs that were cleaned up
   */
  afterCleanup?(ids: string[]): Promise<void>;
}

/**
 * Abstract base class for all factories
 */
export abstract class BaseFactory<
  TData extends { [key: string]: unknown }, // The data type returned by this factory
  TOptions extends BaseFactoryOptions = BaseFactoryOptions, // Options for creating objects
> {
  /**
   * The entity type this factory creates
   */
  protected abstract readonly entityType: TestEntityType;

  /**
   * Public getter for entity type
   */
  getEntityType(): TestEntityType {
    return this.entityType;
  }

  /**
   * ID generator instance
   */
  protected readonly idGenerator: IDGenerator;

  /**
   * Cleanup tracker instance
   */
  protected readonly cleanupTracker: CleanupTracker;

  /**
   * Database connection
   */
  protected readonly db: typeof db;

  /**
   * Default scope for this factory (if any)
   */
  protected defaultScope: string | undefined;

  constructor(
    idGenerator: IDGenerator,
    cleanupTracker: CleanupTracker,
    dbConnection: typeof db = db
  ) {
    this.idGenerator = idGenerator;
    this.cleanupTracker = cleanupTracker;
    this.db = dbConnection;
  }

  /**
   * Create a single test object
   *
   * @param options - Options for creating the object
   * @returns The created object with metadata
   */
  async create(options: TOptions): Promise<FactoryCreateResult<TData>> {
    // Run beforeCreate hook
    const modifiedOptions = await this.beforeCreate?.(options);
    const finalOptions = modifiedOptions || options;

    // Create the object (implemented by subclass)
    // Database will generate UUID automatically
    const data = await this.createInDatabase(finalOptions);

    // Extract ID from created data (subclasses should ensure ID field exists)
    const id = this.extractId(data);

    // Track for cleanup
    const scope = finalOptions.scope || this.defaultScope;
    if (scope || !finalOptions.scope) {
      // Track if scope is explicitly provided or if we should use default behavior
      this.trackObject(id, finalOptions, data);
    }

    // Run afterCreate hook
    await this.afterCreate?.(data, finalOptions);

    return {
      data,
      id,
      type: this.entityType,
      tracked: true,
    };
  }

  /**
   * Create multiple test objects
   *
   * @param count - Number of objects to create
   * @param baseOptions - Base options applied to all objects
   * @returns Array of created objects with metadata
   */
  async createMany(
    count: number,
    baseOptions: TOptions
  ): Promise<Array<FactoryCreateResult<TData>>> {
    if (count < 1) {
      throw new Error(`Count must be at least 1, got: ${count}`);
    }

    const results: Array<FactoryCreateResult<TData>> = [];

    for (let i = 0; i < count; i++) {
      // Create options for this iteration
      const options = await this.modifyOptionsForBatch(baseOptions, i, count);
      const result = await this.create(options);
      results.push(result);
    }

    return results;
  }

  /**
   * Cleanup objects created by this factory
   *
   * @param scope - Optional scope to limit cleanup to
   * @returns Number of objects cleaned up
   */
  async cleanup(scope?: string): Promise<number> {
    const scopeToUse = scope || this.defaultScope;

    // Get IDs to clean up
    const ids = this.cleanupTracker.getIdsByType(this.entityType, scopeToUse);

    if (ids.length === 0) {
      return 0;
    }

    // Run beforeCleanup hook
    await this.beforeCleanup?.(ids);

    // Perform cleanup (implemented by subclass)
    await this.cleanupFromDatabase(ids);

    // Mark as cleaned in tracker
    this.cleanupTracker.markManyCleaned(ids);

    // Run afterCleanup hook
    await this.afterCleanup?.(ids);

    return ids.length;
  }

  /**
   * Cleanup a specific object by ID
   *
   * @param id - The ID to cleanup
   */
  async cleanupOne(id: string): Promise<void> {
    await this.beforeCleanup?.([id]);
    await this.cleanupFromDatabase([id]);
    this.cleanupTracker.markCleaned(id);
    await this.afterCleanup?.([id]);
  }

  /**
   * Set the default scope for this factory
   * All created objects will use this scope unless overridden
   */
  setDefaultScope(scope: string): void {
    this.defaultScope = scope;
  }

  /**
   * Clear the default scope
   */
  clearDefaultScope(): void {
    this.defaultScope = undefined;
  }

  /**
   * Get count of tracked objects for this factory
   */
  getTrackedCount(scope?: string): number {
    const scopeToUse = scope || this.defaultScope;
    return this.cleanupTracker.getIdsByType(this.entityType, scopeToUse).length;
  }

  // Abstract methods that subclasses must implement

  /**
   * Create the object in the database
   * Must be implemented by subclass
   * Database will generate UUIDs automatically
   *
   * @param options - The creation options
   * @returns The created object with database-generated ID
   */
  protected abstract createInDatabase(options: TOptions): Promise<TData>;

  /**
   * Clean up objects from the database
   * Must be implemented by subclass
   *
   * @param ids - Array of IDs to delete
   */
  protected abstract cleanupFromDatabase(ids: string[]): Promise<void>;

  // Protected helper methods

  /**
   * Generate a unique ID for this entity type
   */
  /**
   * Extract ID from created data
   * Subclasses can override if ID field name differs
   */
  protected extractId(data: TData): string {
    // Common ID field names
    const possibleIdFields = [`${this.entityType}_id`, 'id', 'uuid'];

    for (const field of possibleIdFields) {
      if (field in data && typeof data[field] === 'string') {
        return data[field] as string;
      }
    }

    throw new Error(
      `Could not extract ID from ${this.entityType}. ` +
        `Tried fields: ${possibleIdFields.join(', ')}`
    );
  }

  /**
   * Generate unique test name
   * Used for creating unique names/titles for test data
   */
  protected generateTestName(prefix?: string): string {
    const identifier = this.idGenerator.generate(this.entityType);
    return prefix ? `${prefix}_${identifier}` : identifier;
  }

  /**
   * Track an object for cleanup
   */
  protected trackObject(id: string, options: TOptions, data: TData): void {
    const scope = options.scope || this.defaultScope;
    const metadata = options.metadata
      ? {
          ...options.metadata,
          factoryType: this.constructor.name,
        }
      : { factoryType: this.constructor.name };

    const trackedObject: TrackedObject = {
      id,
      type: this.entityType,
      createdAt: new Date(),
      dependents: [],
      dependencies: [],
      ...(scope !== undefined ? { scope } : {}),
      ...(metadata ? { metadata } : {}),
    };

    this.cleanupTracker.track(trackedObject);

    // Track dependencies if the data has foreign keys
    this.trackDependencies(id, data);
  }

  /**
   * Extract and track dependencies from the created data
   * Subclasses can override to add custom dependency tracking
   *
   * @param id - The ID of the created object
   * @param data - The created object data
   */
  protected trackDependencies(id: string, data: TData): void {
    // Default implementation looks for common FK patterns
    const fkFields = ['created_by', 'user_id', 'organization_id', 'parent_id'];

    for (const field of fkFields) {
      const value = data[field];
      if (typeof value === 'string' && this.idGenerator.isTestId(value)) {
        this.cleanupTracker.addDependency(id, value);
      }
    }
  }

  /**
   * Modify options for batch creation
   * Subclasses can override to customize batch behavior
   *
   * @param baseOptions - The base options
   * @param index - The current index in the batch
   * @param total - Total number of objects in batch
   * @returns Modified options
   */
  protected async modifyOptionsForBatch(
    baseOptions: TOptions,
    _index: number,
    _total: number
  ): Promise<TOptions> {
    // Default implementation returns options unchanged
    // Subclasses can override to add index-based variations
    return { ...baseOptions };
  }

  // Optional lifecycle hooks (can be overridden by subclasses)
  protected beforeCreate?(options: TOptions): Promise<TOptions | undefined>;
  protected afterCreate?(data: TData, options: TOptions): Promise<void>;
  protected beforeCleanup?(ids: string[]): Promise<void>;
  protected afterCleanup?(ids: string[]): Promise<void>;
}
