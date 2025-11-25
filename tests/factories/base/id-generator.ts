/**
 * Test Name Generator
 *
 * Generates unique, identifiable names for test data.
 * Database handles UUID generation - this is for human-readable test identifiers.
 *
 * Pattern: test_<type>_<8-char-nanoid>
 * Example: test_user_a3k9d2m1
 */

import { nanoid } from 'nanoid';

/**
 * Valid entity types
 */
export type TestEntityType =
  | 'user'
  | 'dashboard'
  | 'chart'
  | 'organization'
  | 'role'
  | 'permission'
  | 'practice'
  | 'staff'
  | 'patient'
  | 'appointment'
  | 'work_item'
  | 'work_item_type'
  | 'work_item_status';

/**
 * Configuration for name generation
 */
export interface IDGeneratorConfig {
  /**
   * Length of the random portion (default: 8)
   */
  length?: number;

  /**
   * Prefix for all test names (default: 'test')
   */
  prefix?: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<IDGeneratorConfig> = {
  length: 8,
  prefix: 'test',
};

/**
 * Test Name Generator
 * Generates unique identifiers for test data names
 */
export class IDGenerator {
  private readonly config: Required<IDGeneratorConfig>;
  private readonly generatedIds: Set<string> = new Set();

  constructor(config: IDGeneratorConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate a unique test identifier for a specific entity type
   *
   * @param type - The type of entity
   * @returns A unique test identifier
   */
  generate(type: TestEntityType): string {
    const randomPart = nanoid(this.config.length);
    const id = `${this.config.prefix}_${type}_${randomPart}`;

    if (this.generatedIds.has(id)) {
      throw new Error(`CRITICAL: Name collision detected for ${id}`);
    }

    this.generatedIds.add(id);
    return id;
  }

  /**
   * Generate multiple unique identifiers
   */
  generateMany(type: TestEntityType, count: number): string[] {
    if (count < 1) {
      throw new Error(`Count must be at least 1, got: ${count}`);
    }

    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      ids.push(this.generate(type));
    }
    return ids;
  }

  /**
   * Check if a string matches the test identifier pattern
   */
  isTestId(id: string): boolean {
    return id.startsWith(`${this.config.prefix}_`);
  }

  /**
   * Get the number of identifiers generated
   */
  getGeneratedCount(): number {
    return this.generatedIds.size;
  }

  /**
   * Reset internal tracking
   */
  reset(): void {
    this.generatedIds.clear();
  }

  /**
   * Create a SQL pattern for matching test identifiers
   */
  getSQLPattern(type?: TestEntityType): string {
    if (type) {
      return `${this.config.prefix}_${type}_%`;
    }
    return `${this.config.prefix}_%`;
  }
}

/**
 * Default singleton instance
 */
export const defaultIDGenerator = new IDGenerator();
