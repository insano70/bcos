/**
 * Chart Export Legend Utilities
 *
 * Provides utilities for rendering chart legends and titles onto canvas
 * for PNG/PDF exports. Creates composite images that include the legend
 * with values, matching what users see in the UI.
 */

import { formatValue } from '@/lib/utils/chart-data/formatters/value-formatter';
import type { ChartData } from '@/lib/types/analytics';

/**
 * Legend item data for export
 */
export interface LegendExportData {
  label: string;
  color: string;
  value: number;
  formattedValue: string;
}

/**
 * Options for rendering title
 */
interface TitleRenderOptions {
  canvasWidth: number;
  y: number;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
}

/**
 * Options for rendering legend
 */
interface LegendRenderOptions {
  startY: number;
  canvasWidth: number;
  maxItems?: number;
  fontSize?: number;
  fontFamily?: string;
  itemHeight?: number;
  padding?: number;
  columns?: number;
}

/**
 * Result of rendering operation
 */
interface RenderResult {
  heightConsumed: number;
}

/**
 * Get dataset color from Chart.js dataset
 */
function getDatasetColor(dataset: ChartData['datasets'][number], index: number): string {
  // Try backgroundColor first (for bar/pie charts)
  if (dataset.backgroundColor) {
    if (typeof dataset.backgroundColor === 'string') {
      return dataset.backgroundColor;
    }
    if (Array.isArray(dataset.backgroundColor) && dataset.backgroundColor[0]) {
      return String(dataset.backgroundColor[0]);
    }
  }

  // Fall back to borderColor (for line charts)
  if (dataset.borderColor) {
    if (typeof dataset.borderColor === 'string') {
      return dataset.borderColor;
    }
    if (Array.isArray(dataset.borderColor) && dataset.borderColor[0]) {
      return String(dataset.borderColor[0]);
    }
  }

  // Default color palette if nothing found
  const defaultColors = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  ];
  return defaultColors[index % defaultColors.length] ?? '#3b82f6';
}

/**
 * Calculate sum of dataset values
 */
function sumDatasetValues(dataset: ChartData['datasets'][number]): number {
  const dataArray = dataset.data || [];
  return dataArray.reduce((sum: number, value: unknown) => {
    if (typeof value === 'number') {
      return sum + value;
    }
    if (value && typeof value === 'object' && 'y' in value) {
      const yValue = (value as { y: unknown }).y;
      return sum + (typeof yValue === 'number' ? yValue : 0);
    }
    return sum;
  }, 0);
}

/**
 * Extract legend data from chart data for export
 */
export function extractLegendData(
  chartData: ChartData,
  measureType?: string
): LegendExportData[] {
  const items: LegendExportData[] = chartData.datasets.map((dataset, index) => {
    const value = sumDatasetValues(dataset);
    return {
      label: dataset.label || `Series ${index + 1}`,
      color: getDatasetColor(dataset, index),
      value,
      formattedValue: formatValue(value, measureType || chartData.measureType || 'number'),
    };
  });

  // Sort by value descending (matching UI behavior)
  items.sort((a, b) => b.value - a.value);

  return items;
}

/**
 * Render title onto canvas
 *
 * @param ctx - Canvas 2D rendering context
 * @param title - Title text to render
 * @param options - Rendering options
 * @returns Height consumed by the title
 */
export function renderTitleToCanvas(
  ctx: CanvasRenderingContext2D,
  title: string,
  options: TitleRenderOptions
): RenderResult {
  const {
    canvasWidth,
    y,
    fontSize = 18,
    fontFamily = 'system-ui, -apple-system, sans-serif',
    color = '#1f2937',
  } = options;

  ctx.font = `bold ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  ctx.fillText(title, canvasWidth / 2, y);

  // Return height consumed (font size + padding)
  return { heightConsumed: fontSize + 16 };
}

/**
 * Render legend onto canvas
 *
 * @param ctx - Canvas 2D rendering context
 * @param legendData - Array of legend items
 * @param options - Rendering options
 * @returns Height consumed by the legend
 */
export function renderLegendToCanvas(
  ctx: CanvasRenderingContext2D,
  legendData: LegendExportData[],
  options: LegendRenderOptions
): RenderResult {
  const {
    startY,
    canvasWidth,
    maxItems = 20,
    fontSize = 12,
    fontFamily = 'system-ui, -apple-system, sans-serif',
    itemHeight = 24,
    padding = 16,
  } = options;

  if (legendData.length === 0) {
    return { heightConsumed: 0 };
  }

  // Limit items to prevent overflow
  const items = legendData.slice(0, maxItems);
  const hasMore = legendData.length > maxItems;

  // Calculate layout - aim for 2-3 columns depending on width
  const availableWidth = canvasWidth - padding * 2;
  const minItemWidth = 200;
  const columns = Math.max(1, Math.min(3, Math.floor(availableWidth / minItemWidth)));
  const columnWidth = availableWidth / columns;

  let currentY = startY;
  let currentColumn = 0;
  let rowStartY = startY;

  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textBaseline = 'middle';

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;

    const columnX = padding + currentColumn * columnWidth;
    const itemY = rowStartY + itemHeight / 2;

    // Draw color swatch
    const swatchSize = 12;
    ctx.fillStyle = item.color;
    ctx.fillRect(columnX, itemY - swatchSize / 2, swatchSize, swatchSize);

    // Draw label
    ctx.fillStyle = '#374151';
    ctx.textAlign = 'left';
    const labelX = columnX + swatchSize + 8;
    const maxLabelWidth = columnWidth - swatchSize - 80; // Reserve space for value

    // Truncate label if too long
    let displayLabel = item.label;
    while (ctx.measureText(displayLabel).width > maxLabelWidth && displayLabel.length > 3) {
      displayLabel = `${displayLabel.slice(0, -4)}...`;
    }
    ctx.fillText(displayLabel, labelX, itemY);

    // Draw value (right-aligned within column)
    ctx.fillStyle = '#1f2937';
    ctx.font = `bold ${fontSize}px ${fontFamily}`;
    ctx.textAlign = 'right';
    const valueX = columnX + columnWidth - 8;
    ctx.fillText(item.formattedValue, valueX, itemY);

    // Reset font for next iteration
    ctx.font = `${fontSize}px ${fontFamily}`;

    // Move to next column or row
    currentColumn++;
    if (currentColumn >= columns) {
      currentColumn = 0;
      rowStartY += itemHeight;
    }
  }

  // Calculate final height
  const rows = Math.ceil(items.length / columns);
  let totalHeight = rows * itemHeight + 8; // Extra padding at bottom

  // Add "and X more..." if truncated
  if (hasMore) {
    const moreText = `and ${legendData.length - maxItems} more...`;
    ctx.fillStyle = '#6b7280';
    ctx.font = `italic ${fontSize - 1}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText(moreText, canvasWidth / 2, startY + totalHeight);
    totalHeight += itemHeight;
  }

  currentY = startY + totalHeight;

  return { heightConsumed: currentY - startY };
}

/**
 * Calculate total height needed for title and legend
 */
export function calculateExportHeaderHeight(
  title: string | undefined,
  legendData: LegendExportData[],
  canvasWidth: number,
  options?: {
    titleFontSize?: number;
    legendFontSize?: number;
    legendItemHeight?: number;
    maxLegendItems?: number;
  }
): number {
  const {
    titleFontSize = 18,
    legendItemHeight = 24,
    maxLegendItems = 20,
  } = options || {};

  let height = 16; // Top padding

  // Title height
  if (title) {
    height += titleFontSize + 16;
  }

  // Legend height
  if (legendData.length > 0) {
    const items = Math.min(legendData.length, maxLegendItems);
    const minItemWidth = 200;
    const availableWidth = canvasWidth - 32; // padding
    const columns = Math.max(1, Math.min(3, Math.floor(availableWidth / minItemWidth)));
    const rows = Math.ceil(items / columns);
    height += rows * legendItemHeight + 8;

    // "and X more..." line if truncated
    if (legendData.length > maxLegendItems) {
      height += legendItemHeight;
    }
  }

  height += 8; // Bottom padding before chart

  return height;
}

