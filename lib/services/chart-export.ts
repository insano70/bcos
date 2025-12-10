import type { ChartData } from '@/lib/types/analytics';
import { clientDebugLog } from '@/lib/utils/debug-client';
import {
  type LegendExportData,
  renderTitleToCanvas,
  renderLegendToCanvas,
  calculateExportHeaderHeight,
} from '@/lib/utils/chart-export-legend';

/**
 * Chart Export Service
 * Implements chart export functionality for PNG, PDF, and data downloads
 */

export interface ExportOptions {
  format: 'png' | 'jpeg' | 'pdf' | 'csv' | 'xlsx';
  width?: number;
  height?: number;
  backgroundColor?: string;
  filename?: string;
  includeTitle?: boolean;
  includeMetadata?: boolean;
  /** Chart title for export header */
  title?: string;
  /** Legend data to render above the chart */
  legendData?: LegendExportData[];
}

// Re-export for convenience
export type { LegendExportData };

export interface ExportResult {
  success: boolean;
  data?: Blob | string;
  filename: string;
  mimeType: string;
  error?: string;
}

export class ChartExportService {
  /**
   * Export chart as image (PNG/JPEG) with optional title and legend
   */
  async exportChartAsImage(
    canvas: HTMLCanvasElement,
    options: ExportOptions = { format: 'png' }
  ): Promise<ExportResult> {
    try {
      const {
        format = 'png',
        backgroundColor = 'white',
        filename,
        title,
        legendData,
      } = options;

      // Calculate header height for title and legend
      const chartWidth = options.width || canvas.width;
      const headerHeight = calculateExportHeaderHeight(title, legendData || [], chartWidth);
      const chartHeight = options.height || canvas.height;
      const totalHeight = headerHeight + chartHeight;

      // Create a new canvas with background color
      const exportCanvas = document.createElement('canvas');
      const ctx = exportCanvas.getContext('2d');

      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      exportCanvas.width = chartWidth;
      exportCanvas.height = totalHeight;

      // Fill background
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

      let currentY = 16; // Top padding

      // Render title if provided
      if (title) {
        const titleResult = renderTitleToCanvas(ctx, title, {
          canvasWidth: chartWidth,
          y: currentY,
        });
        currentY += titleResult.heightConsumed;
      }

      // Render legend if provided
      if (legendData && legendData.length > 0) {
        const legendResult = renderLegendToCanvas(ctx, legendData, {
          startY: currentY,
          canvasWidth: chartWidth,
        });
        currentY += legendResult.heightConsumed;
      }

      // Draw the chart below the header
      ctx.drawImage(canvas, 0, currentY, chartWidth, chartHeight);

      // Convert to blob
      return new Promise((resolve) => {
        exportCanvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve({
                success: false,
                filename: filename || `chart.${format}`,
                mimeType: `image/${format}`,
                error: 'Failed to generate image',
              });
              return;
            }

            resolve({
              success: true,
              data: blob,
              filename: filename || `chart_${Date.now()}.${format}`,
              mimeType: `image/${format}`,
            });
          },
          `image/${format}`,
          format === 'jpeg' ? 0.9 : undefined
        );
      });
    } catch (error) {
      return {
        success: false,
        filename: options.filename || `chart.${options.format}`,
        mimeType: `image/${options.format}`,
        error: error instanceof Error ? error.message : 'Export failed',
      };
    }
  }

  /**
   * Export chart data as CSV
   */
  exportChartDataAsCSV(
    chartData: ChartData,
    rawData: Record<string, unknown>[],
    options: ExportOptions = { format: 'csv' }
  ): ExportResult {
    try {
      const { filename } = options;

      // Use raw data if available, otherwise use chart data
      const dataToExport = rawData.length > 0 ? rawData : this.convertChartDataToTable(chartData);

      if (dataToExport.length === 0) {
        return {
          success: false,
          filename: filename || 'chart_data.csv',
          mimeType: 'text/csv',
          error: 'No data to export',
        };
      }

      // Generate CSV content
      if (dataToExport.length === 0) {
        return {
          success: false,
          filename: filename || 'chart_data.csv',
          mimeType: 'text/csv',
          error: 'No data to export',
        };
      }
      const headers = Object.keys(dataToExport[0] as Record<string, unknown>);
      const csvContent = [
        headers.join(','),
        ...dataToExport.map((row) =>
          headers
            .map((header) => {
              const value = row[header];
              // Escape commas and quotes in CSV
              if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                return `"${value.replace(/"/g, '""')}"`;
              }
              return value;
            })
            .join(',')
        ),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });

      return {
        success: true,
        data: blob,
        filename: filename || `chart_data_${Date.now()}.csv`,
        mimeType: 'text/csv',
      };
    } catch (error) {
      return {
        success: false,
        filename: options.filename || 'chart_data.csv',
        mimeType: 'text/csv',
        error: error instanceof Error ? error.message : 'CSV export failed',
      };
    }
  }

  /**
   * Export chart as PDF using jsPDF (dynamically imported for bundle optimization)
   * Includes title and legend if provided
   */
  async exportChartAsPDF(
    canvas: HTMLCanvasElement,
    options: ExportOptions = { format: 'pdf' }
  ): Promise<ExportResult> {
    try {
      const { filename, backgroundColor = 'white', title, legendData } = options;

      // Dynamically import jsPDF to avoid including it in the main bundle
      const { jsPDF } = await import('jspdf');

      // Create composite canvas with title and legend
      const chartWidth = canvas.width;
      const chartHeight = canvas.height;
      const headerHeight = calculateExportHeaderHeight(title, legendData || [], chartWidth);
      const totalHeight = headerHeight + chartHeight;

      // Create composite canvas
      const compositeCanvas = document.createElement('canvas');
      const ctx = compositeCanvas.getContext('2d');

      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      compositeCanvas.width = chartWidth;
      compositeCanvas.height = totalHeight;

      // Fill background
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, compositeCanvas.width, compositeCanvas.height);

      let currentY = 16; // Top padding

      // Render title if provided
      if (title) {
        const titleResult = renderTitleToCanvas(ctx, title, {
          canvasWidth: chartWidth,
          y: currentY,
        });
        currentY += titleResult.heightConsumed;
      }

      // Render legend if provided
      if (legendData && legendData.length > 0) {
        const legendResult = renderLegendToCanvas(ctx, legendData, {
          startY: currentY,
          canvasWidth: chartWidth,
        });
        currentY += legendResult.heightConsumed;
      }

      // Draw the chart below the header
      ctx.drawImage(canvas, 0, currentY, chartWidth, chartHeight);

      // Create PDF in landscape orientation if composite is wider than tall
      const orientation = chartWidth > totalHeight ? 'landscape' : 'portrait';

      const pdf = new jsPDF({
        orientation,
        unit: 'pt',
        format: 'a4',
      });

      // Get PDF page dimensions
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // Calculate scaling to fit composite on page with margins
      const margin = 40;
      const availableWidth = pageWidth - margin * 2;
      const availableHeight = pageHeight - margin * 2;

      const scaleX = availableWidth / chartWidth;
      const scaleY = availableHeight / totalHeight;
      const scale = Math.min(scaleX, scaleY, 1); // Don't upscale

      const scaledWidth = chartWidth * scale;
      const scaledHeight = totalHeight * scale;

      // Center the composite on the page
      const offsetX = (pageWidth - scaledWidth) / 2;
      const offsetY = (pageHeight - scaledHeight) / 2;

      // Add white background
      pdf.setFillColor(backgroundColor);
      pdf.rect(0, 0, pageWidth, pageHeight, 'F');

      // Convert composite canvas to image data and add to PDF
      const imageData = compositeCanvas.toDataURL('image/png', 1.0);
      pdf.addImage(imageData, 'PNG', offsetX, offsetY, scaledWidth, scaledHeight);

      // Generate PDF blob
      const pdfBlob = pdf.output('blob');

      return {
        success: true,
        data: pdfBlob,
        filename: filename || `chart_${Date.now()}.pdf`,
        mimeType: 'application/pdf',
      };
    } catch (error) {
      clientDebugLog.component('PDF export failed', { error });
      return {
        success: false,
        filename: options.filename || 'chart.pdf',
        mimeType: 'application/pdf',
        error: error instanceof Error ? error.message : 'PDF export failed',
      };
    }
  }

  /**
   * Download exported file
   */
  downloadFile(result: ExportResult): void {
    if (!result.success || !result.data) {
      clientDebugLog.component('Cannot download file', { error: result.error });
      return;
    }

    const url = URL.createObjectURL(result.data as Blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = result.filename;

    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up
    URL.revokeObjectURL(url);
  }

  /**
   * Get export options for different chart types
   */
  getExportOptionsForChartType(_chartType: string): ExportOptions[] {
    return [
      { format: 'png' as const, width: 1200, height: 800 },
      { format: 'jpeg' as const, width: 1200, height: 800 },
      { format: 'pdf' as const, width: 1200, height: 800 },
      { format: 'csv' as const },
    ];
  }

  /**
   * Convert Chart.js data to tabular format for CSV export
   */
  private convertChartDataToTable(chartData: ChartData): Record<string, unknown>[] {
    const result: Record<string, unknown>[] = [];

    chartData.labels.forEach((label, index) => {
      const row: Record<string, unknown> = { label: label };

      chartData.datasets.forEach((dataset) => {
        row[dataset.label || 'Value'] = dataset.data[index] || 0;
      });

      result.push(row);
    });

    return result;
  }

  /**
   * Validate export options
   */
  validateExportOptions(options: ExportOptions): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!['png', 'jpeg', 'pdf', 'csv', 'xlsx'].includes(options.format)) {
      errors.push('Invalid export format');
    }

    if (options.width && (options.width < 100 || options.width > 4000)) {
      errors.push('Width must be between 100 and 4000 pixels');
    }

    if (options.height && (options.height < 100 || options.height > 4000)) {
      errors.push('Height must be between 100 and 4000 pixels');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get export statistics
   */
  getExportStats(): {
    totalExports: number;
    exportsByFormat: Record<string, number>;
    recentExports: Array<{
      timestamp: Date;
      format: string;
      filename: string;
    }>;
  } {
    // This would typically be stored in a database
    // For now, return placeholder data
    return {
      totalExports: 0,
      exportsByFormat: {},
      recentExports: [],
    };
  }
}

// Export singleton instance
export const chartExportService = new ChartExportService();
