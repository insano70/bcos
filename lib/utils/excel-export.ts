/**
 * Excel Export Utility
 *
 * Provides functions to export data to Excel (.xlsx) format with multiple sheets.
 * Uses ExcelJS library with dynamic import to minimize bundle size impact.
 *
 * USAGE:
 * ```typescript
 * import { exportToExcel } from '@/lib/utils/excel-export';
 *
 * const columns = [{ name: 'id', type: 'number' }, { name: 'email', type: 'string' }];
 * const data = [{ id: 1, email: 'john@example.com' }];
 * const sql = 'SELECT * FROM users';
 *
 * await exportToExcel(data, columns, sql, 'users-export', { rowCount: 25, executionTime: 150 });
 * ```
 */

import type { Workbook, Worksheet } from 'exceljs';
import { detectDataType, formatExportValue, generateExportFilename } from './export-helpers';

interface ExcelColumn {
  name: string;
  type: string;
}

interface ExcelMetadata {
  rowCount?: number;
  executionTime?: number;
}

/**
 * Dynamically import ExcelJS to avoid bundle size impact
 */
async function getExcelJS(): Promise<typeof import('exceljs')> {
  return await import('exceljs');
}

/**
 * Create and format the Results sheet
 */
function createResultsSheet(
  worksheet: Worksheet,
  data: Record<string, unknown>[],
  columns: ExcelColumn[]
): void {
  // Add header row
  const headers = columns.map((col) => col.name);
  worksheet.addRow(headers);

  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4F46E5' }, // Violet-600
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
  headerRow.height = 20;

  // Freeze header row
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  // Add data rows
  for (const row of data) {
    const rowData = columns.map((col) => {
      const value = row[col.name];
      return formatExportValue(value, col.name);
    });
    worksheet.addRow(rowData);
  }

  // Auto-size columns based on content
  worksheet.columns = columns.map((col) => {
    // Calculate max width from header and data
    let maxLength = col.name.length;

    for (const row of data) {
      const value = row[col.name];
      if (value !== null && value !== undefined) {
        const valueStr = String(value);
        maxLength = Math.max(maxLength, valueStr.length);
      }
    }

    // Set width with padding (min 10, max 50)
    const width = Math.min(Math.max(maxLength + 2, 10), 50);

    return {
      key: col.name,
      width,
    };
  });

  // Apply cell formatting based on data type
  for (let rowIdx = 2; rowIdx <= data.length + 1; rowIdx++) {
    const dataRow = worksheet.getRow(rowIdx);

    for (let colIdx = 0; colIdx < columns.length; colIdx++) {
      const column = columns[colIdx];
      if (!column) continue;

      const cell = dataRow.getCell(colIdx + 1);
      const value = data[rowIdx - 2]?.[column.name];
      const dataType = detectDataType(value);

      // Format dates
      if (dataType === 'date') {
        cell.numFmt = 'yyyy-mm-dd hh:mm:ss';
      }

      // Format numbers
      if (dataType === 'number') {
        cell.numFmt = '#,##0.00';
      }

      // Alignment
      if (dataType === 'number') {
        cell.alignment = { horizontal: 'right' };
      } else {
        cell.alignment = { horizontal: 'left' };
      }
    }
  }

  // Add borders to all cells
  const lastRow = worksheet.rowCount;
  const lastCol = columns.length;

  for (let row = 1; row <= lastRow; row++) {
    for (let col = 1; col <= lastCol; col++) {
      const cell = worksheet.getCell(row, col);
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
    }
  }
}

/**
 * Create and format the SQL sheet
 */
function createSQLSheet(
  worksheet: Worksheet,
  sql: string,
  metadata?: ExcelMetadata
): void {
  // Add title
  worksheet.addRow(['SQL Query']);
  const titleRow = worksheet.getRow(1);
  titleRow.font = { bold: true, size: 14 };
  titleRow.height = 24;

  // Add blank row
  worksheet.addRow([]);

  // Add metadata if available
  if (metadata) {
    if (metadata.executionTime !== undefined) {
      worksheet.addRow(['Execution Time:', `${metadata.executionTime}ms`]);
    }
    if (metadata.rowCount !== undefined) {
      worksheet.addRow(['Row Count:', metadata.rowCount]);
    }
    worksheet.addRow(['Generated:', new Date().toISOString()]);
    worksheet.addRow([]);
  }

  // Add SQL query (split by lines for readability)
  const sqlLines = sql.split('\n');
  worksheet.addRow(['Query:']);
  const queryHeaderRow = worksheet.getRow(worksheet.rowCount);
  queryHeaderRow.font = { bold: true };

  for (const line of sqlLines) {
    worksheet.addRow([line]);
  }

  // Set column widths
  worksheet.getColumn(1).width = 20;
  worksheet.getColumn(2).width = 80;

  // Wrap text for SQL lines
  const startRow = metadata ? 7 : 3;
  for (let row = startRow; row <= worksheet.rowCount; row++) {
    const cell = worksheet.getCell(row, 1);
    cell.alignment = { wrapText: true, vertical: 'top' };
  }
}

/**
 * Export data to Excel and trigger download
 *
 * @param data - Array of data objects
 * @param columns - Column definitions with names and types
 * @param sql - SQL query text
 * @param baseFilename - Base filename (timestamp will be added)
 * @param metadata - Optional execution metadata
 */
export async function exportToExcel(
  data: Record<string, unknown>[],
  columns: ExcelColumn[],
  sql: string,
  baseFilename: string,
  metadata?: ExcelMetadata
): Promise<void> {
  // Dynamically import ExcelJS
  const ExcelJS = await getExcelJS();
  const workbook: Workbook = new ExcelJS.Workbook();

  // Set workbook properties
  workbook.creator = 'BendCare Data Explorer';
  workbook.created = new Date();
  workbook.modified = new Date();

  // Create Results sheet
  const resultsSheet = workbook.addWorksheet('Results', {
    properties: { tabColor: { argb: 'FF4F46E5' } },
  });
  createResultsSheet(resultsSheet, data, columns);

  // Create SQL sheet
  const sqlSheet = workbook.addWorksheet('SQL', {
    properties: { tabColor: { argb: 'FF10B981' } },
  });
  createSQLSheet(sqlSheet, sql, metadata);

  // Generate filename
  const filename = generateExportFilename(baseFilename, 'xlsx');

  // Generate buffer and trigger download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  // Create download link
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;

  // Trigger download
  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
