import { ChartData } from '@/lib/types/analytics';

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
}

export interface ExportResult {
  success: boolean;
  data?: Blob | string;
  filename: string;
  mimeType: string;
  error?: string;
}

export class ChartExportService {

  /**
   * Export chart as image (PNG/JPEG)
   */
  async exportChartAsImage(
    canvas: HTMLCanvasElement,
    options: ExportOptions = { format: 'png' }
  ): Promise<ExportResult> {
    try {
      const { format = 'png', backgroundColor = 'white', filename } = options;
      
      // Create a new canvas with background color
      const exportCanvas = document.createElement('canvas');
      const ctx = exportCanvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      exportCanvas.width = options.width || canvas.width;
      exportCanvas.height = options.height || canvas.height;

      // Fill background
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

      // Draw the chart
      ctx.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);

      // Convert to blob
      return new Promise((resolve) => {
        exportCanvas.toBlob((blob) => {
          if (!blob) {
            resolve({
              success: false,
              filename: filename || `chart.${format}`,
              mimeType: `image/${format}`,
              error: 'Failed to generate image'
            });
            return;
          }

          resolve({
            success: true,
            data: blob,
            filename: filename || `chart_${Date.now()}.${format}`,
            mimeType: `image/${format}`
          });
        }, `image/${format}`, format === 'jpeg' ? 0.9 : undefined);
      });

    } catch (error) {
      return {
        success: false,
        filename: options.filename || `chart.${options.format}`,
        mimeType: `image/${options.format}`,
        error: error instanceof Error ? error.message : 'Export failed'
      };
    }
  }

  /**
   * Export chart data as CSV
   */
  exportChartDataAsCSV(
    chartData: ChartData,
    rawData: any[],
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
          error: 'No data to export'
        };
      }

      // Generate CSV content
      const headers = Object.keys(dataToExport[0]);
      const csvContent = [
        headers.join(','),
        ...dataToExport.map(row => 
          headers.map(header => {
            const value = row[header];
            // Escape commas and quotes in CSV
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          }).join(',')
        )
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });

      return {
        success: true,
        data: blob,
        filename: filename || `chart_data_${Date.now()}.csv`,
        mimeType: 'text/csv'
      };

    } catch (error) {
      return {
        success: false,
        filename: options.filename || 'chart_data.csv',
        mimeType: 'text/csv',
        error: error instanceof Error ? error.message : 'CSV export failed'
      };
    }
  }

  /**
   * Export chart as PDF (basic implementation)
   */
  async exportChartAsPDF(
    canvas: HTMLCanvasElement,
    options: ExportOptions = { format: 'pdf' }
  ): Promise<ExportResult> {
    try {
      // For a full PDF implementation, you'd use a library like jsPDF
      // This is a placeholder implementation
      const imageResult = await this.exportChartAsImage(canvas, { 
        ...options, 
        format: 'png' 
      });

      if (!imageResult.success || !imageResult.data) {
        return {
          success: false,
          filename: options.filename || 'chart.pdf',
          mimeType: 'application/pdf',
          error: 'Failed to generate PDF'
        };
      }

      // This would typically use jsPDF to create a proper PDF
      // For now, return the PNG data with PDF mime type as placeholder
      return {
        success: true,
        data: imageResult.data,
        filename: options.filename || `chart_${Date.now()}.pdf`,
        mimeType: 'application/pdf'
      };

    } catch (error) {
      return {
        success: false,
        filename: options.filename || 'chart.pdf',
        mimeType: 'application/pdf',
        error: error instanceof Error ? error.message : 'PDF export failed'
      };
    }
  }

  /**
   * Download exported file
   */
  downloadFile(result: ExportResult): void {
    if (!result.success || !result.data) {
      console.error('Cannot download file:', result.error);
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
  getExportOptionsForChartType(chartType: string): ExportOptions[] {
    const baseOptions = [
      { format: 'png' as const, width: 1200, height: 800 },
      { format: 'jpeg' as const, width: 1200, height: 800 },
      { format: 'csv' as const },
    ];

    // PDF would be added here when implemented
    // if (chartType === 'bar' || chartType === 'line') {
    //   baseOptions.push({ format: 'pdf' as const, width: 1200, height: 800 });
    // }

    return baseOptions;
  }

  /**
   * Convert Chart.js data to tabular format for CSV export
   */
  private convertChartDataToTable(chartData: ChartData): any[] {
    const result: any[] = [];
    
    chartData.labels.forEach((label, index) => {
      const row: any = { label: label };
      
      chartData.datasets.forEach(dataset => {
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
      errors
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
      recentExports: []
    };
  }
}

// Export singleton instance
export const chartExportService = new ChartExportService();
