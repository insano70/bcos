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
   * @returns Transformed ChartData for Chart.js (may be async for handlers that need data source config)
   */
  transform(data: Record<string, unknown>[], config: Record<string, unknown>): ChartData | Promise<ChartData>;

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
   * Uses two-step lookup:
   * 1. Direct map lookup by type (fast path)
   * 2. Check all handlers' canHandle() method (allows multi-type handlers)
   *
   * @param chartType - Chart type identifier
   * @returns Handler instance or null if not found
   */
  getHandler(chartType: string): ChartTypeHandler | null {
    // Fast path: Direct lookup by primary type
    const directHandler = this.handlers.get(chartType);
    if (directHandler) {
      return directHandler;
    }

    // Slow path: Check all handlers' canHandle() method
    // This allows handlers to support multiple chart types
    // (e.g., BarChartHandler handles 'bar', 'stacked-bar', 'horizontal-bar')
    const allHandlers = Array.from(this.handlers.values());
    for (const handler of allHandlers) {
      if (handler.canHandle({ chartType })) {
        log.debug('Handler found via canHandle() method', {
          chartType,
          handlerType: handler.type,
        });
        return handler;
      }
    }

    // No handler found
    log.warn('No handler found for chart type', {
      chartType,
      availableTypes: Array.from(this.handlers.keys()),
      message: 'Checked both direct lookup and canHandle() methods',
    });
    return null;
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
