/**
 * Chart Transformer Factory
 * 
 * Central registry and factory for chart transformation strategies.
 * Implements the Strategy pattern with a registry for dynamic lookup.
 */

import type { ChartTransformStrategy } from './base-strategy';
import { LineChartStrategy } from './line-chart-strategy';
import { BarChartStrategy } from './bar-chart-strategy';
import { PieChartStrategy } from './pie-chart-strategy';
import { HorizontalBarStrategy } from './horizontal-bar-strategy';
import { ProgressBarStrategy } from './progress-bar-strategy';
import { MultiSeriesStrategy } from './multi-series-strategy';
import { DualAxisStrategy } from './dual-axis-strategy';

/**
 * Chart Transformer Factory
 * 
 * Manages registration and retrieval of chart transformation strategies.
 */
export class ChartTransformerFactory {
  private strategies: Map<string, ChartTransformStrategy>;

  constructor() {
    this.strategies = new Map();
    this.registerDefaultStrategies();
  }

  /**
   * Register default strategies
   */
  private registerDefaultStrategies(): void {
    this.register(new LineChartStrategy());
    this.register(new BarChartStrategy());
    this.register(new PieChartStrategy());
    this.register(new HorizontalBarStrategy());
    this.register(new ProgressBarStrategy());
    this.register(new MultiSeriesStrategy());
    this.register(new DualAxisStrategy());
  }

  /**
   * Register a strategy
   * 
   * @param strategy - Strategy to register
   */
  register(strategy: ChartTransformStrategy): void {
    this.strategies.set(strategy.type, strategy);
  }

  /**
   * Get strategy for chart type
   * 
   * @param chartType - Chart type identifier
   * @returns Strategy instance or undefined if not found
   */
  getStrategy(chartType: string): ChartTransformStrategy | undefined {
    // Try direct type match first
    if (this.strategies.has(chartType)) {
      return this.strategies.get(chartType);
    }

    // Find strategy that can handle this chart type
    const strategies = Array.from(this.strategies.values());
    for (const strategy of strategies) {
      if (strategy.canHandle(chartType)) {
        return strategy;
      }
    }

    return undefined;
  }

  /**
   * Check if a strategy exists for a chart type
   * 
   * @param chartType - Chart type identifier
   * @returns True if strategy exists
   */
  hasStrategy(chartType: string): boolean {
    return this.getStrategy(chartType) !== undefined;
  }

  /**
   * Get all registered chart types
   * 
   * @returns Array of chart type identifiers
   */
  getAllTypes(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Get all registered strategies
   * 
   * @returns Array of strategy instances
   */
  getAllStrategies(): ChartTransformStrategy[] {
    return Array.from(this.strategies.values());
  }
}

// Export singleton instance
export const chartTransformerFactory = new ChartTransformerFactory();

