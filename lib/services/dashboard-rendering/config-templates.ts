/**
 * Chart Config Templates Registry
 *
 * Phase 1 Enhancement: Provides default configurations for each chart type.
 * Ensures consistent configs and reduces duplicate configuration logic.
 *
 * Benefits:
 * - Consistent defaults across all charts of same type
 * - Easier to maintain chart-type-specific logic
 * - Centralized configuration management
 * - Better documentation of chart requirements
 */

/**
 * Chart config template interface
 */
export interface ChartConfigTemplate {
  chartType: string;
  defaultConfig: Record<string, unknown>;
  requiredFields: string[];
  optionalFields: string[];
  description: string;
}

/**
 * Chart Config Templates Registry
 *
 * Manages default configurations for all chart types.
 */
class ConfigTemplatesRegistry {
  private templates = new Map<string, ChartConfigTemplate>();

  constructor() {
    // Register all chart type templates
    this.registerAllTemplates();
  }

  /**
   * Register all chart type templates
   */
  private registerAllTemplates(): void {
    // Line Chart
    this.register({
      chartType: 'line',
      defaultConfig: {
        colorPalette: 'default',
        groupBy: 'none',
        showLegend: true,
        showTooltips: true,
        enableAnimation: true,
      },
      requiredFields: ['dataSourceId', 'measure', 'frequency'],
      optionalFields: ['groupBy', 'colorPalette', 'stackingMode'],
      description: 'Time-series line chart for trend visualization',
    });

    // Bar Chart
    this.register({
      chartType: 'bar',
      defaultConfig: {
        colorPalette: 'default',
        groupBy: 'none',
        showLegend: true,
        showTooltips: true,
        enableAnimation: true,
        borderWidth: 1,
        borderRadius: 4,
      },
      requiredFields: ['dataSourceId', 'measure', 'frequency'],
      optionalFields: ['groupBy', 'colorPalette', 'stackingMode'],
      description: 'Vertical bar chart for comparing values',
    });

    // Stacked Bar Chart
    this.register({
      chartType: 'stacked-bar',
      defaultConfig: {
        colorPalette: 'default',
        groupBy: 'none',
        showLegend: true,
        showTooltips: true,
        enableAnimation: true,
        stackingMode: 'normal',
        borderWidth: 1,
        borderRadius: 4,
      },
      requiredFields: ['dataSourceId', 'measure', 'frequency', 'groupBy'],
      optionalFields: ['colorPalette', 'stackingMode'],
      description: 'Stacked bar chart for part-to-whole comparison',
    });

    // Horizontal Bar Chart
    this.register({
      chartType: 'horizontal-bar',
      defaultConfig: {
        colorPalette: 'default',
        groupBy: 'none',
        showLegend: true,
        showTooltips: true,
        enableAnimation: true,
        borderWidth: 1,
        borderRadius: 4,
      },
      requiredFields: ['dataSourceId', 'measure', 'frequency'],
      optionalFields: ['groupBy', 'colorPalette'],
      description: 'Horizontal bar chart for ranking and comparison',
    });

    // Progress Bar Chart
    this.register({
      chartType: 'progress-bar',
      defaultConfig: {
        colorPalette: 'default',
        aggregation: 'sum',
        groupBy: 'none',
        showLegend: false,
        showTooltips: true,
      },
      requiredFields: ['dataSourceId', 'measure', 'frequency', 'groupBy'],
      optionalFields: ['aggregation', 'target', 'colorPalette'],
      description: 'Progress bar chart for goal tracking',
    });

    // Area Chart
    this.register({
      chartType: 'area',
      defaultConfig: {
        colorPalette: 'default',
        groupBy: 'none',
        showLegend: true,
        showTooltips: true,
        enableAnimation: true,
        fill: true,
      },
      requiredFields: ['dataSourceId', 'measure', 'frequency'],
      optionalFields: ['groupBy', 'colorPalette', 'stackingMode'],
      description: 'Area chart for volume and trend visualization',
    });

    // Pie Chart
    this.register({
      chartType: 'pie',
      defaultConfig: {
        colorPalette: 'default',
        showLegend: true,
        showTooltips: true,
        enableAnimation: true,
      },
      requiredFields: ['dataSourceId', 'measure', 'frequency', 'groupBy'],
      optionalFields: ['colorPalette'],
      description: 'Pie chart for part-to-whole distribution',
    });

    // Doughnut Chart
    this.register({
      chartType: 'doughnut',
      defaultConfig: {
        colorPalette: 'default',
        showLegend: true,
        showTooltips: true,
        enableAnimation: true,
        cutout: '50%',
      },
      requiredFields: ['dataSourceId', 'measure', 'frequency', 'groupBy'],
      optionalFields: ['colorPalette', 'cutout'],
      description: 'Doughnut chart for part-to-whole distribution with center space',
    });

    // Dual-Axis Chart
    this.register({
      chartType: 'dual-axis',
      defaultConfig: {
        colorPalette: 'default',
        showLegend: true,
        showTooltips: true,
        enableAnimation: true,
        frequency: 'Monthly',
      },
      requiredFields: ['dataSourceId', 'frequency', 'dualAxisConfig'],
      optionalFields: ['colorPalette'],
      description: 'Dual-axis chart for comparing two measures with different scales',
    });

    // Number Chart
    this.register({
      chartType: 'number',
      defaultConfig: {
        aggregation: 'sum',
        showTrend: false,
        colorPalette: 'default',
      },
      requiredFields: ['dataSourceId', 'measure', 'frequency'],
      optionalFields: ['aggregation', 'showTrend', 'target'],
      description: 'Single number display for KPI tracking',
    });

    // Table Chart
    this.register({
      chartType: 'table',
      defaultConfig: {
        showPagination: true,
        pageSize: 50,
        sortable: true,
        filterable: true,
      },
      requiredFields: ['dataSourceId'],
      optionalFields: ['columns', 'pageSize', 'sortable', 'filterable'],
      description: 'Data table for detailed record viewing',
    });
  }

  /**
   * Register a chart type template
   *
   * @param template - Chart config template
   */
  register(template: ChartConfigTemplate): void {
    this.templates.set(template.chartType, template);
  }

  /**
   * Get template for a chart type
   *
   * @param chartType - Chart type
   * @returns Template or undefined if not found
   */
  getTemplate(chartType: string): ChartConfigTemplate | undefined {
    return this.templates.get(chartType);
  }

  /**
   * Apply template defaults to a chart config
   *
   * Merges template defaults with existing config.
   * Existing config values take precedence.
   *
   * @param chartType - Chart type
   * @param config - Existing chart config
   * @returns Config with template defaults applied
   */
  applyTemplate(chartType: string, config: Record<string, unknown>): Record<string, unknown> {
    const template = this.templates.get(chartType);

    if (!template) {
      // No template found - return config as-is
      return config;
    }

    // Merge template defaults with config (config takes precedence)
    return {
      ...template.defaultConfig,
      ...config,
    };
  }

  /**
   * Validate config against template requirements
   *
   * Checks if all required fields are present.
   *
   * @param chartType - Chart type
   * @param config - Chart config to validate
   * @returns Validation result
   */
  validateAgainstTemplate(
    chartType: string,
    config: Record<string, unknown>
  ): { isValid: boolean; missingFields: string[] } {
    const template = this.templates.get(chartType);

    if (!template) {
      // No template - skip validation
      return { isValid: true, missingFields: [] };
    }

    const missingFields = template.requiredFields.filter((field) => {
      const value = config[field];
      return value === undefined || value === null || value === '';
    });

    return {
      isValid: missingFields.length === 0,
      missingFields,
    };
  }

  /**
   * Get all registered chart types
   *
   * @returns Array of chart types
   */
  getAllChartTypes(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * Get template documentation for a chart type
   *
   * @param chartType - Chart type
   * @returns Template info or undefined
   */
  getTemplateInfo(chartType: string): Omit<ChartConfigTemplate, 'defaultConfig'> | undefined {
    const template = this.templates.get(chartType);

    if (!template) {
      return undefined;
    }

    return {
      chartType: template.chartType,
      requiredFields: template.requiredFields,
      optionalFields: template.optionalFields,
      description: template.description,
    };
  }

  /**
   * Get all template documentation
   *
   * Useful for generating documentation or UI help text.
   *
   * @returns Array of template info
   */
  getAllTemplateInfo(): Array<Omit<ChartConfigTemplate, 'defaultConfig'>> {
    return Array.from(this.templates.values()).map((template) => ({
      chartType: template.chartType,
      requiredFields: template.requiredFields,
      optionalFields: template.optionalFields,
      description: template.description,
    }));
  }
}

// Export singleton instance
export const configTemplatesRegistry = new ConfigTemplatesRegistry();

