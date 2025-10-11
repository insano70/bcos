import type { UserContext } from '@/lib/types/rbac';
import type { ChartData } from '@/lib/types/analytics';
import { log } from '@/lib/logger';

/**
 * Chart Type Registry
 *
 * Pluggable registry system for chart type handlers.
 * Allows easy addition of new chart types without modifying core code.
 *
 * Design Pattern: Registry + Strategy
 * - Registry: Central registration and lookup of handlers
 * - Strategy: Each handler implements same interface, different behavior
 */

/**
 * Validation result from chart handler
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Chart Type Handler Interface
 *
 * All chart type handlers must implement this interface.
 * Ensures consistent behavior across different chart types.
 */
export interface ChartTypeHandler {
  /**
   * Unique identifier for this chart type
   */
  type: string;

  /**
   * Check if this handler can handle the given configuration
   *
   * @param config - Chart configuration
   * @returns true if this handler can process this config
   */
  canHandle(config: Record<string, unknown>): boolean;

  /**
   * Fetch raw data for this chart type
   *
   * @param config - Merged chart configuration with runtime filters
   * @param userContext - User context for RBAC
   * @returns Array of raw data records
   */
  fetchData(
    config: Record<string, unknown>,
    userContext: UserContext
  ): Promise<Record<string, unknown>[]>;

  /**
   * Transform raw data into Chart.js format
   *
   * @param data - Raw data from fetchData()
   * @param config - Chart configuration
   * @returns Transformed ChartData for Chart.js
   */
  transform(data: Record<string, unknown>[], config: Record<string, unknown>): ChartData;

  /**
   * Validate chart configuration
   *
   * @param config - Chart configuration to validate
   * @returns Validation result with errors if invalid
   */
  validate(config: Record<string, unknown>): ValidationResult;
}

/**
 * Chart Type Registry Class
 *
 * Singleton registry for managing chart type handlers.
 */
class ChartTypeRegistry {
  private handlers = new Map<string, ChartTypeHandler>();

  /**
   * Register a chart type handler
   *
   * @param handler - Handler instance to register
   * @throws Error if handler type already registered
   */
  register(handler: ChartTypeHandler): void {
    if (this.handlers.has(handler.type)) {
      log.warn('Chart type handler already registered, overwriting', {
        chartType: handler.type,
      });
    }

    this.handlers.set(handler.type, handler);

    log.info('Chart type handler registered', {
      chartType: handler.type,
      totalHandlers: this.handlers.size,
    });
  }

  /**
   * Get handler for a specific chart type
   *
   * @param chartType - Chart type identifier
   * @returns Handler instance or null if not found
   */
  getHandler(chartType: string): ChartTypeHandler | null {
    const handler = this.handlers.get(chartType);

    if (!handler) {
      log.warn('No handler found for chart type', {
        chartType,
        availableTypes: Array.from(this.handlers.keys()),
      });
      return null;
    }

    return handler;
  }

  /**
   * Get all registered chart types
   *
   * @returns Array of registered chart type identifiers
   */
  getAllTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Check if a chart type is registered
   *
   * @param chartType - Chart type identifier
   * @returns true if handler exists
   */
  hasHandler(chartType: string): boolean {
    return this.handlers.has(chartType);
  }

  /**
   * Unregister a chart type handler (for testing)
   *
   * @param chartType - Chart type identifier
   */
  unregister(chartType: string): void {
    this.handlers.delete(chartType);

    log.info('Chart type handler unregistered', {
      chartType,
      totalHandlers: this.handlers.size,
    });
  }

  /**
   * Clear all registered handlers (for testing)
   */
  clear(): void {
    const count = this.handlers.size;
    this.handlers.clear();

    log.info('All chart type handlers cleared', {
      clearedCount: count,
    });
  }
}

// Export singleton instance
export const chartTypeRegistry = new ChartTypeRegistry();
