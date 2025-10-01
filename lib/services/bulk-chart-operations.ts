import { apiClient } from '@/lib/api/client';
import type { SuccessResponse } from '@/lib/api/responses/success';
import type { ChartDefinition, ChartFilter } from '@/lib/types/analytics';
// Note: Using console for client-side logging to avoid winston fs dependency
// import { logger } from '@/lib/logger';

/**
 * Bulk Chart Operations Service
 * Implements bulk chart management tools for mass updates, exports, and organization
 */

export interface BulkOperation {
  id: string;
  type: 'update' | 'delete' | 'export' | 'organize' | 'clone';
  chartIds: string[];
  parameters: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number; // 0-100
  startedAt: Date;
  completedAt?: Date;
  results: BulkOperationResult[];
  error?: string;
}

export interface BulkOperationResult {
  chartId: string;
  success: boolean;
  error?: string;
  data?: unknown;
}

export interface BulkUpdateParams extends Record<string, unknown> {
  updates: Partial<ChartDefinition>;
  filters?: ChartFilter[];
  categoryId?: number;
  isActive?: boolean;
}

export interface BulkOrganizeParams extends Record<string, unknown> {
  categoryId: number;
  tags?: string[];
  newOwner?: string;
}

export class BulkChartOperationsService {
  private operations = new Map<string, BulkOperation>();

  /**
   * Bulk update charts
   */
  async bulkUpdateCharts(
    chartIds: string[],
    updates: BulkUpdateParams,
    operatorUserId: string
  ): Promise<string> {
    const operationId = `bulk_update_${Date.now()}`;

    const operation: BulkOperation = {
      id: operationId,
      type: 'update',
      chartIds,
      parameters: updates,
      status: 'pending',
      progress: 0,
      startedAt: new Date(),
      results: [],
    };

    this.operations.set(operationId, operation);

    // Start async processing
    this.processBulkUpdate(operationId, updates, operatorUserId);

    return operationId;
  }

  /**
   * Bulk delete charts
   */
  async bulkDeleteCharts(chartIds: string[], operatorUserId: string): Promise<string> {
    const operationId = `bulk_delete_${Date.now()}`;

    const operation: BulkOperation = {
      id: operationId,
      type: 'delete',
      chartIds,
      parameters: {},
      status: 'pending',
      progress: 0,
      startedAt: new Date(),
      results: [],
    };

    this.operations.set(operationId, operation);

    // Start async processing
    this.processBulkDelete(operationId, operatorUserId);

    return operationId;
  }

  /**
   * Bulk export charts
   */
  async bulkExportCharts(
    chartIds: string[],
    exportFormat: 'png' | 'pdf' | 'csv',
    operatorUserId: string
  ): Promise<string> {
    const operationId = `bulk_export_${Date.now()}`;

    const operation: BulkOperation = {
      id: operationId,
      type: 'export',
      chartIds,
      parameters: { format: exportFormat },
      status: 'pending',
      progress: 0,
      startedAt: new Date(),
      results: [],
    };

    this.operations.set(operationId, operation);

    // Start async processing
    this.processBulkExport(operationId, exportFormat, operatorUserId);

    return operationId;
  }

  /**
   * Bulk organize charts (move to category, change ownership, etc.)
   */
  async bulkOrganizeCharts(
    chartIds: string[],
    organizeParams: BulkOrganizeParams,
    operatorUserId: string
  ): Promise<string> {
    const operationId = `bulk_organize_${Date.now()}`;

    const operation: BulkOperation = {
      id: operationId,
      type: 'organize',
      chartIds,
      parameters: organizeParams,
      status: 'pending',
      progress: 0,
      startedAt: new Date(),
      results: [],
    };

    this.operations.set(operationId, operation);

    // Start async processing
    this.processBulkOrganize(operationId, organizeParams, operatorUserId);

    return operationId;
  }

  /**
   * Clone charts with modifications
   */
  async bulkCloneCharts(
    chartIds: string[],
    modifications: Partial<ChartDefinition>,
    operatorUserId: string
  ): Promise<string> {
    const operationId = `bulk_clone_${Date.now()}`;

    const operation: BulkOperation = {
      id: operationId,
      type: 'clone',
      chartIds,
      parameters: modifications,
      status: 'pending',
      progress: 0,
      startedAt: new Date(),
      results: [],
    };

    this.operations.set(operationId, operation);

    // Start async processing
    this.processBulkClone(operationId, modifications, operatorUserId);

    return operationId;
  }

  /**
   * Get operation status
   */
  getOperationStatus(operationId: string): BulkOperation | null {
    return this.operations.get(operationId) || null;
  }

  /**
   * Get all operations for a user
   */
  getUserOperations(userId: string): BulkOperation[] {
    // This would typically filter by user ID from the operation metadata
    return Array.from(this.operations.values()).sort(
      (a, b) => b.startedAt.getTime() - a.startedAt.getTime()
    );
  }

  /**
   * Cancel a running operation
   */
  cancelOperation(operationId: string): boolean {
    const operation = this.operations.get(operationId);
    if (!operation || operation.status !== 'running') {
      return false;
    }

    operation.status = 'failed';
    operation.error = 'Operation cancelled by user';
    operation.completedAt = new Date();

    this.operations.set(operationId, operation);

    console.info('Bulk operation cancelled', { operationId });
    return true;
  }

  private async processBulkUpdate(
    operationId: string,
    updates: BulkUpdateParams,
    operatorUserId: string
  ): Promise<void> {
    const operation = this.operations.get(operationId);
    if (!operation) return;

    operation.status = 'running';
    this.operations.set(operationId, operation);

    try {
      for (let i = 0; i < operation.chartIds.length; i++) {
        const chartId = operation.chartIds[i];
        if (!chartId) continue;

        try {
          // This would typically make API calls to update each chart
          await apiClient.put(`/api/admin/analytics/charts/${chartId}`, updates.updates);

          const result: BulkOperationResult = {
            chartId,
            success: true,
          };

          operation.results.push(result);
          operation.progress = Math.round(((i + 1) / operation.chartIds.length) * 100);
          this.operations.set(operationId, operation);
        } catch (error) {
          operation.results.push({
            chartId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      operation.status = 'completed';
      operation.completedAt = new Date();
      this.operations.set(operationId, operation);

      console.info('Bulk update completed', {
        operationId,
        totalCharts: operation.chartIds.length,
        successCount: operation.results.filter((r) => r.success).length,
      });
    } catch (error) {
      operation.status = 'failed';
      operation.error = error instanceof Error ? error.message : 'Unknown error';
      operation.completedAt = new Date();
      this.operations.set(operationId, operation);

      console.error('Bulk update failed', { operationId, error });
    }
  }

  private async processBulkDelete(operationId: string, operatorUserId: string): Promise<void> {
    const operation = this.operations.get(operationId);
    if (!operation) return;

    operation.status = 'running';
    this.operations.set(operationId, operation);

    try {
      for (let i = 0; i < operation.chartIds.length; i++) {
        const chartId = operation.chartIds[i];
        if (!chartId) continue;

        try {
          await apiClient.delete(`/api/admin/analytics/charts/${chartId}`);

          const result: BulkOperationResult = {
            chartId,
            success: true,
          };
          operation.results.push(result);

          operation.progress = Math.round(((i + 1) / operation.chartIds.length) * 100);
          this.operations.set(operationId, operation);
        } catch (error) {
          operation.results.push({
            chartId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      operation.status = 'completed';
      operation.completedAt = new Date();
      this.operations.set(operationId, operation);

      console.info('Bulk delete completed', { operationId });
    } catch (error) {
      operation.status = 'failed';
      operation.error = error instanceof Error ? error.message : 'Unknown error';
      operation.completedAt = new Date();
      this.operations.set(operationId, operation);

      console.error('Bulk delete failed', { operationId, error });
    }
  }

  private async processBulkExport(
    operationId: string,
    exportFormat: string,
    operatorUserId: string
  ): Promise<void> {
    const operation = this.operations.get(operationId);
    if (!operation) return;

    operation.status = 'running';
    this.operations.set(operationId, operation);

    try {
      // This would typically generate exports for each chart
      // For now, simulate the process
      for (let i = 0; i < operation.chartIds.length; i++) {
        const chartId = operation.chartIds[i];
        if (!chartId) continue;

        // Simulate export processing
        await new Promise((resolve) => setTimeout(resolve, 100));

        operation.results.push({
          chartId,
          success: true,
          data: { exportUrl: `/exports/chart_${chartId}.${exportFormat}` },
        });

        operation.progress = Math.round(((i + 1) / operation.chartIds.length) * 100);
        this.operations.set(operationId, operation);
      }

      operation.status = 'completed';
      operation.completedAt = new Date();
      this.operations.set(operationId, operation);

      console.info('Bulk export completed', { operationId, exportFormat });
    } catch (error) {
      operation.status = 'failed';
      operation.error = error instanceof Error ? error.message : 'Unknown error';
      operation.completedAt = new Date();
      this.operations.set(operationId, operation);

      console.error('Bulk export failed', { operationId, error });
    }
  }

  private async processBulkOrganize(
    operationId: string,
    organizeParams: BulkOrganizeParams,
    operatorUserId: string
  ): Promise<void> {
    const operation = this.operations.get(operationId);
    if (!operation) return;

    operation.status = 'running';
    this.operations.set(operationId, operation);

    try {
      for (let i = 0; i < operation.chartIds.length; i++) {
        const chartId = operation.chartIds[i];
        if (!chartId) continue;

        try {
          const updateData: Partial<ChartDefinition> = {};
          if (organizeParams.categoryId) updateData.chart_category_id = organizeParams.categoryId;
          if (organizeParams.newOwner) updateData.created_by = organizeParams.newOwner;

          await apiClient.put(`/api/admin/analytics/charts/${chartId}`, updateData);

          const result: BulkOperationResult = {
            chartId,
            success: true,
          };
          operation.results.push(result);

          operation.progress = Math.round(((i + 1) / operation.chartIds.length) * 100);
          this.operations.set(operationId, operation);
        } catch (error) {
          operation.results.push({
            chartId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      operation.status = 'completed';
      operation.completedAt = new Date();
      this.operations.set(operationId, operation);

      console.info('Bulk organize completed', { operationId });
    } catch (error) {
      operation.status = 'failed';
      operation.error = error instanceof Error ? error.message : 'Unknown error';
      operation.completedAt = new Date();
      this.operations.set(operationId, operation);

      console.error('Bulk organize failed', { operationId, error });
    }
  }

  private async processBulkClone(
    operationId: string,
    modifications: Partial<ChartDefinition>,
    operatorUserId: string
  ): Promise<void> {
    const operation = this.operations.get(operationId);
    if (!operation) return;

    operation.status = 'running';
    this.operations.set(operationId, operation);

    try {
      for (let i = 0; i < operation.chartIds.length; i++) {
        const chartId = operation.chartIds[i];
        if (!chartId) continue;

        try {
          // Get original chart
          const originalChart = await apiClient.get<SuccessResponse<{ chart: ChartDefinition }>>(
            `/api/admin/analytics/charts/${chartId}`
          );

          // Create cloned chart with modifications
          const { chart_definition_id, created_at, updated_at, ...chartWithoutIds } =
            originalChart.data.chart;
          const clonedChart = {
            ...chartWithoutIds,
            ...modifications,
            chart_name: `${originalChart.data.chart.chart_name} (Copy)`,
            created_by: operatorUserId,
          };

          const newChart = await apiClient.post<SuccessResponse<{ chart: ChartDefinition }>>(
            '/api/admin/analytics/charts',
            clonedChart
          );

          const result: BulkOperationResult = {
            chartId,
            success: true,
            data: { newChartId: newChart.data.chart.chart_definition_id },
          };

          operation.results.push(result);
          operation.progress = Math.round(((i + 1) / operation.chartIds.length) * 100);
          this.operations.set(operationId, operation);
        } catch (error) {
          operation.results.push({
            chartId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      operation.status = 'completed';
      operation.completedAt = new Date();
      this.operations.set(operationId, operation);

      console.info('Bulk clone completed', { operationId });
    } catch (error) {
      operation.status = 'failed';
      operation.error = error instanceof Error ? error.message : 'Unknown error';
      operation.completedAt = new Date();
      this.operations.set(operationId, operation);

      console.error('Bulk clone failed', { operationId, error });
    }
  }

  /**
   * Get operation progress
   */
  getOperationProgress(operationId: string): {
    status: string;
    progress: number;
    completed: number;
    failed: number;
    total: number;
  } | null {
    const operation = this.operations.get(operationId);
    if (!operation) return null;

    return {
      status: operation.status,
      progress: operation.progress,
      completed: operation.results.filter((r) => r.success).length,
      failed: operation.results.filter((r) => !r.success).length,
      total: operation.chartIds.length,
    };
  }

  /**
   * Get bulk operation statistics
   */
  getBulkOperationStats(): {
    totalOperations: number;
    operationsByType: Record<string, number>;
    successRate: number;
    averageDuration: number;
  } {
    const operations = Array.from(this.operations.values());
    const completed = operations.filter((op) => op.status === 'completed');

    const operationsByType: Record<string, number> = {};
    operations.forEach((op) => {
      operationsByType[op.type] = (operationsByType[op.type] || 0) + 1;
    });

    const totalResults = completed.reduce((sum, op) => sum + op.results.length, 0);
    const successfulResults = completed.reduce(
      (sum, op) => sum + op.results.filter((r) => r.success).length,
      0
    );
    const successRate = totalResults > 0 ? (successfulResults / totalResults) * 100 : 0;

    const durations = completed
      .filter((op) => op.completedAt)
      .map((op) => op.completedAt!.getTime() - op.startedAt.getTime());
    const averageDuration =
      durations.length > 0
        ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length
        : 0;

    return {
      totalOperations: operations.length,
      operationsByType,
      successRate,
      averageDuration,
    };
  }

  /**
   * Clean up old operations
   */
  cleanupOldOperations(retentionDays: number = 30): void {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    for (const [operationId, operation] of Array.from(this.operations.entries())) {
      if (operation.startedAt < cutoffDate && operation.status !== 'running') {
        this.operations.delete(operationId);
      }
    }

    console.info('Old bulk operations cleaned up', {
      retentionDays,
      remainingOperations: this.operations.size,
    });
  }
}

// Export singleton instance
export const bulkChartOperationsService = new BulkChartOperationsService();
