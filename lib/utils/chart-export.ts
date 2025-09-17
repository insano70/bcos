/**
 * Chart Export Utilities
 * Export charts as PNG, PDF, or data files
 */

export class ChartExporter {
  
  /**
   * Export chart as PNG image
   */
  static exportAsPNG(chartCanvas: HTMLCanvasElement, filename: string = 'chart.png'): void {
    try {
      // Get the chart canvas data as base64
      const imageData = chartCanvas.toDataURL('image/png', 1.0);
      
      // Create download link
      const link = document.createElement('a');
      link.download = filename;
      link.href = imageData;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log('✅ Chart exported as PNG:', filename);
    } catch (error) {
      console.error('❌ Failed to export chart as PNG:', error);
      throw new Error('Failed to export chart as PNG');
    }
  }

  /**
   * Export chart as PDF (requires html2canvas and jsPDF)
   */
  static async exportAsPDF(chartElement: HTMLElement, filename: string = 'chart.pdf'): Promise<void> {
    try {
      // For now, we'll export as PNG and note that PDF requires additional libraries
      console.warn('PDF export requires html2canvas and jsPDF libraries. Exporting as PNG instead.');
      
      const canvas = chartElement.querySelector('canvas');
      if (canvas) {
        ChartExporter.exportAsPNG(canvas, filename.replace('.pdf', '.png'));
      } else {
        throw new Error('No canvas found in chart element');
      }
    } catch (error) {
      console.error('❌ Failed to export chart as PDF:', error);
      throw new Error('Failed to export chart as PDF');
    }
  }

  /**
   * Export chart data as CSV
   */
  static exportDataAsCSV(chartData: any, filename: string = 'chart-data.csv'): void {
    try {
      // Convert chart data to CSV format
      const labels = chartData.labels || [];
      const datasets = chartData.datasets || [];
      
      // Build CSV content
      let csvContent = 'Date';
      datasets.forEach((dataset: any) => {
        csvContent += `,${dataset.label || 'Series'}`;
      });
      csvContent += '\n';

      // Add data rows
      labels.forEach((label: string, index: number) => {
        csvContent += `${label}`;
        datasets.forEach((dataset: any) => {
          const value = dataset.data[index] || 0;
          csvContent += `,${value}`;
        });
        csvContent += '\n';
      });

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log('✅ Chart data exported as CSV:', filename);
    } catch (error) {
      console.error('❌ Failed to export chart data as CSV:', error);
      throw new Error('Failed to export chart data as CSV');
    }
  }

  /**
   * Export chart data as JSON
   */
  static exportDataAsJSON(chartData: any, filename: string = 'chart-data.json'): void {
    try {
      const jsonContent = JSON.stringify(chartData, null, 2);
      
      const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log('✅ Chart data exported as JSON:', filename);
    } catch (error) {
      console.error('❌ Failed to export chart data as JSON:', error);
      throw new Error('Failed to export chart data as JSON');
    }
  }

  /**
   * Get chart image as base64 string
   */
  static getChartImageData(chartCanvas: HTMLCanvasElement): string {
    return chartCanvas.toDataURL('image/png', 1.0);
  }

  /**
   * Copy chart image to clipboard
   */
  static async copyChartToClipboard(chartCanvas: HTMLCanvasElement): Promise<void> {
    try {
      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve) => {
        chartCanvas.toBlob((blob) => {
          if (blob) resolve(blob);
        }, 'image/png');
      });

      // Copy to clipboard
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      
      console.log('✅ Chart copied to clipboard');
    } catch (error) {
      console.error('❌ Failed to copy chart to clipboard:', error);
      throw new Error('Failed to copy chart to clipboard');
    }
  }
}

/**
 * Chart Export Hook for React components
 */
export function useChartExport() {
  const exportChart = (chartRef: React.RefObject<HTMLCanvasElement>, format: 'png' | 'csv' | 'json', chartData?: any, filename?: string) => {
    try {
      if (!chartRef.current) {
        throw new Error('Chart reference not found');
      }

      const defaultFilename = `chart-${new Date().toISOString().split('T')[0]}`;

      switch (format) {
        case 'png':
          ChartExporter.exportAsPNG(chartRef.current, filename || `${defaultFilename}.png`);
          break;
        case 'csv':
          if (!chartData) throw new Error('Chart data required for CSV export');
          ChartExporter.exportDataAsCSV(chartData, filename || `${defaultFilename}.csv`);
          break;
        case 'json':
          if (!chartData) throw new Error('Chart data required for JSON export');
          ChartExporter.exportDataAsJSON(chartData, filename || `${defaultFilename}.json`);
          break;
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }
    } catch (error) {
      console.error('Chart export failed:', error);
      throw error;
    }
  };

  const copyToClipboard = async (chartRef: React.RefObject<HTMLCanvasElement>) => {
    if (!chartRef.current) {
      throw new Error('Chart reference not found');
    }
    
    await ChartExporter.copyChartToClipboard(chartRef.current);
  };

  return { exportChart, copyToClipboard };
}
