import { describe, expect, it } from 'vitest';
import {
  analyticsQuerySchema,
  bulkOperationSchema,
  chartCategoryCreateSchema,
  chartCategoryParamsSchema,
  chartCategoryUpdateSchema,
  chartDefinitionCreateSchema,
  chartDefinitionParamsSchema,
  chartDefinitionUpdateSchema,
  dashboardCreateSchema,
  dashboardParamsSchema,
  dashboardUpdateSchema,
  dataSourceSchema,
  favoriteCreateSchema,
  favoriteDeleteSchema,
} from '@/lib/validations/analytics';

describe('analytics validation schemas', () => {
  describe('chartCategoryCreateSchema', () => {
    it('should validate correct chart category creation data', () => {
      const validData = {
        category_name: 'Patient Analytics',
        category_description: 'Charts related to patient metrics',
        parent_category_id: 1,
      };

      const result = chartCategoryCreateSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should validate category creation without optional fields', () => {
      const minimalData = {
        category_name: 'Basic Category',
      };

      const result = chartCategoryCreateSchema.safeParse(minimalData);
      expect(result.success).toBe(true);
      expect(result.data?.category_name).toBe('Basic Category');
    });

    it('should reject empty category name', () => {
      const invalidData = {
        category_name: '',
      };

      const result = chartCategoryCreateSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error?.issues?.[0]?.message).toBe('Name is required');
    });

    it('should reject overly long category name', () => {
      const longName = 'a'.repeat(256);
      const invalidData = {
        category_name: longName,
      };

      const result = chartCategoryCreateSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error?.issues?.[0]?.message).toBe('Name too long');
    });

    it('should reject overly long description', () => {
      const longDescription = 'a'.repeat(1001);
      const invalidData = {
        category_name: 'Category',
        category_description: longDescription,
      };

      const result = chartCategoryCreateSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error?.issues?.[0]?.message).toBe('Description too long');
    });

    it('should reject invalid parent category ID', () => {
      const invalidData = {
        category_name: 'Category',
        parent_category_id: -1,
      };

      const result = chartCategoryCreateSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error?.issues?.[0]?.message).toBe('ID must be a positive integer');
    });

    it('should accept string numbers for parent category ID', () => {
      const validData = {
        category_name: 'Category',
        parent_category_id: '1',
      };

      const result = chartCategoryCreateSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data?.parent_category_id).toBe(1);
    });
  });

  describe('chartCategoryUpdateSchema', () => {
    it('should validate partial category update data', () => {
      const validData = {
        category_name: 'Updated Category',
        category_description: 'Updated description',
      };

      const result = chartCategoryUpdateSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should allow empty update', () => {
      const emptyData = {};

      const result = chartCategoryUpdateSchema.safeParse(emptyData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(emptyData);
    });

    it('should reject empty name in update', () => {
      const invalidData = {
        category_name: '',
      };

      const result = chartCategoryUpdateSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error?.issues?.[0]?.message).toBe('Name is required');
    });

    it('should accept valid parent category ID', () => {
      const validData = {
        parent_category_id: 5,
      };

      const result = chartCategoryUpdateSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data?.parent_category_id).toBe(5);
    });
  });

  describe('chartCategoryParamsSchema', () => {
    it('should validate correct category ID parameter', () => {
      const validData = {
        categoryId: 123,
      };

      const result = chartCategoryParamsSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should reject invalid category ID', () => {
      const invalidData = {
        categoryId: 0,
      };

      const result = chartCategoryParamsSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error?.issues?.[0]?.message).toBe('ID must be a positive integer');
    });

    it('should accept string category ID', () => {
      const validData = {
        categoryId: '123',
      };

      const result = chartCategoryParamsSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data?.categoryId).toBe(123);
    });
  });

  describe('chartDefinitionCreateSchema', () => {
    it('should validate correct chart definition creation data', () => {
      const validData = {
        chart_name: 'Patient Visits Chart',
        chart_description: 'Shows patient visit trends',
        chart_type: 'line',
        chart_category_id: 1,
        data_source: 'patients_table',
        is_active: true,
      };

      const result = chartDefinitionCreateSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should validate with complex data source config', () => {
      const validData = {
        chart_name: 'Complex Chart',
        chart_type: 'bar',
        data_source: {
          table: 'visits',
          filters: [
            {
              field: 'visit_date',
              operator: 'between',
              value: ['2024-01-01', '2024-12-31'],
            },
          ],
          orderBy: [{ field: 'visit_date', direction: 'desc' }],
          limit: 100,
        },
      };

      const result = chartDefinitionCreateSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data?.data_source).toEqual({
        table: 'visits',
        filters: [
          {
            field: 'visit_date',
            operator: 'between',
            value: ['2024-01-01', '2024-12-31'],
          },
        ],
        orderBy: [{ field: 'visit_date', direction: 'desc' }],
        limit: 100,
      });
    });

    it('should validate with chart config', () => {
      const validData = {
        chart_name: 'Configured Chart',
        chart_type: 'pie',
        data_source: 'revenue_table',
        chart_config: {
          chartName: 'Revenue Chart',
          chartType: 'doughnut',
          measure: 'revenue',
          frequency: 'monthly',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          useAdvancedFiltering: true,
          useMultipleSeries: false,
        },
      };

      const result = chartDefinitionCreateSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data?.chart_config?.chartName).toBe('Revenue Chart');
    });

    it('should apply default is_active value', () => {
      const dataWithoutActive = {
        chart_name: 'Default Active Chart',
        chart_type: 'bar',
        data_source: 'data_table',
      };

      const result = chartDefinitionCreateSchema.safeParse(dataWithoutActive);
      expect(result.success).toBe(true);
      expect(result.data?.is_active).toBe(true);
    });

    it('should reject empty chart name', () => {
      const invalidData = {
        chart_name: '',
        chart_type: 'line',
        data_source: 'table',
      };

      const result = chartDefinitionCreateSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error?.issues?.[0]?.message).toBe('Name is required');
    });

    it('should reject invalid chart type', () => {
      const invalidData = {
        chart_name: 'Chart',
        chart_type: 'invalid_type',
        data_source: 'table',
      };

      const result = chartDefinitionCreateSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error?.issues?.[0]?.path).toContain('chart_type');
    });

    it('should reject empty data source', () => {
      const invalidData = {
        chart_name: 'Chart',
        chart_type: 'line',
        data_source: '',
      };

      const result = chartDefinitionCreateSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error?.issues?.[0]?.message).toBe('Data source is required');
    });

    it('should validate all chart types', () => {
      const validTypes = ['line', 'bar', 'pie', 'area', 'scatter', 'histogram', 'heatmap'];

      validTypes.forEach((type) => {
        const result = chartDefinitionCreateSchema.safeParse({
          chart_name: 'Test Chart',
          chart_type: type,
          data_source: 'test_table',
        });
        expect(result.success).toBe(true);
      });
    });
  });

  describe('chartDefinitionUpdateSchema', () => {
    it('should validate partial chart definition updates', () => {
      const validData = {
        chart_name: 'Updated Chart Name',
        chart_description: 'Updated description',
      };

      const result = chartDefinitionUpdateSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data?.chart_name).toBe('Updated Chart Name');
      expect(result.data?.chart_description).toBe('Updated description');
    });

    it('should allow empty update', () => {
      const emptyData = {};

      const result = chartDefinitionUpdateSchema.safeParse(emptyData);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should validate complete update with all fields', () => {
      const completeData = {
        chart_name: 'Complete Update',
        chart_description: 'Full update description',
        chart_type: 'area',
        chart_category_id: 2,
        data_source: 'updated_table',
        is_active: false,
      };

      const result = chartDefinitionUpdateSchema.safeParse(completeData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(completeData);
    });
  });

  describe('chartDefinitionParamsSchema', () => {
    it('should validate correct chart ID parameter', () => {
      const validData = {
        chartId: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = chartDefinitionParamsSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should reject invalid chart ID', () => {
      const invalidData = {
        chartId: 'invalid-uuid',
      };

      const result = chartDefinitionParamsSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error?.issues?.[0]?.message).toBe('Invalid UUID format');
    });
  });

  describe('dashboardCreateSchema', () => {
    it('should validate correct dashboard creation data', () => {
      const validData = {
        dashboard_name: 'Patient Dashboard',
        dashboard_description: 'Comprehensive patient metrics',
        dashboard_category_id: 1,
        chart_ids: ['550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440001'],
        layout_config: { columns: 3, rows: 2 },
        is_active: true,
      };

      const result = dashboardCreateSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        ...validData,
        is_published: false, // Schema adds default value
        is_default: false, // Schema adds default value
      });
    });

    it('should validate dashboard creation with minimal data', () => {
      const minimalData = {
        dashboard_name: 'Simple Dashboard',
      };

      const result = dashboardCreateSchema.safeParse(minimalData);
      expect(result.success).toBe(true);
      expect(result.data?.is_active).toBe(true);
    });

    it('should reject too many chart IDs', () => {
      const tooManyCharts = Array.from(
        { length: 51 },
        (_, i) => `550e8400-e29b-41d4-a716-446655440${i.toString().padStart(3, '0')}`
      );

      const invalidData = {
        dashboard_name: 'Too Many Charts',
        chart_ids: tooManyCharts,
      };

      const result = dashboardCreateSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error?.issues?.[0]?.message).toBe('Too many charts');
    });

    it('should reject invalid chart UUIDs', () => {
      const invalidData = {
        dashboard_name: 'Dashboard',
        chart_ids: ['invalid-uuid'],
      };

      const result = dashboardCreateSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error?.issues?.[0]?.message).toBe('Invalid UUID format');
    });
  });

  describe('dashboardUpdateSchema', () => {
    it('should validate partial dashboard updates', () => {
      const validData = {
        dashboard_name: 'Updated Dashboard',
        is_active: false,
      };

      const result = dashboardUpdateSchema.safeParse(validData);
      expect(result.success).toBe(true);
      // Update schema explicitly removes defaults from is_published and is_active
      // Only fields explicitly provided should be in the result
      expect(result.data).toEqual(validData);
    });

    it('should allow empty update', () => {
      const emptyData = {};

      const result = dashboardUpdateSchema.safeParse(emptyData);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });
  });

  describe('dashboardParamsSchema', () => {
    it('should validate correct dashboard ID parameter', () => {
      const validData = {
        dashboardId: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = dashboardParamsSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should reject invalid dashboard ID', () => {
      const invalidData = {
        dashboardId: 'invalid-uuid',
      };

      const result = dashboardParamsSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error?.issues?.[0]?.message).toBe('Invalid UUID format');
    });
  });

  describe('favoriteCreateSchema', () => {
    it('should validate correct favorite creation data', () => {
      const validData = {
        chart_definition_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = favoriteCreateSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should reject invalid chart definition ID', () => {
      const invalidData = {
        chart_definition_id: 'invalid-uuid',
      };

      const result = favoriteCreateSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error?.issues?.[0]?.message).toBe('Invalid UUID format');
    });
  });

  describe('favoriteDeleteSchema', () => {
    it('should validate correct favorite deletion data', () => {
      const validData = {
        chart_definition_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = favoriteDeleteSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should reject invalid chart definition ID', () => {
      const invalidData = {
        chart_definition_id: 'invalid-uuid',
      };

      const result = favoriteDeleteSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error?.issues?.[0]?.message).toBe('Invalid UUID format');
    });
  });

  describe('analyticsQuerySchema', () => {
    it('should validate complete query parameters', () => {
      const validData = {
        category_id: '550e8400-e29b-41d4-a716-446655440000',
        is_active: true,
        search: 'patient analytics',
        sort_by: 'name',
        sort_order: 'desc',
        page: 2,
        limit: 25,
      };

      const result = analyticsQuerySchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should validate partial query parameters', () => {
      const partialData = {
        search: 'test',
        page: 1,
      };

      const result = analyticsQuerySchema.safeParse(partialData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(partialData);
    });

    it('should coerce string numbers to numbers', () => {
      const stringNumbers = {
        page: '3',
        limit: '50',
        is_active: 'true',
      };

      const result = analyticsQuerySchema.safeParse(stringNumbers);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        page: 3,
        limit: 50,
        is_active: true,
      });
    });

    it('should reject invalid sort_by values', () => {
      const invalidData = {
        sort_by: 'invalid_field',
      };

      const result = analyticsQuerySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error?.issues?.[0]?.path).toContain('sort_by');
    });

    it('should reject invalid sort_order values', () => {
      const invalidData = {
        sort_order: 'sideways',
      };

      const result = analyticsQuerySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error?.issues?.[0]?.path).toContain('sort_order');
    });

    it('should reject invalid page number', () => {
      const invalidData = {
        page: -1,
      };

      const result = analyticsQuerySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error?.issues?.[0]?.path).toContain('page');
    });

    it('should reject invalid limit range', () => {
      const invalidData = {
        limit: 150,
      };

      const result = analyticsQuerySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error?.issues?.[0]?.path).toContain('limit');
    });

    it('should reject overly long search string', () => {
      const longSearch = 'a'.repeat(256);
      const invalidData = {
        search: longSearch,
      };

      const result = analyticsQuerySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error?.issues?.[0]?.path).toContain('search');
    });
  });

  describe('bulkOperationSchema', () => {
    it('should validate correct bulk operation data', () => {
      const validData = {
        operation: 'clone',
        chart_ids: ['550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440001'],
        dashboard_ids: ['550e8400-e29b-41d4-a716-446655440002'],
        export_format: 'json',
      };

      const result = bulkOperationSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should validate minimal bulk operation', () => {
      const minimalData = {
        operation: 'delete',
        chart_ids: ['550e8400-e29b-41d4-a716-446655440000'],
      };

      const result = bulkOperationSchema.safeParse(minimalData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(minimalData);
    });

    it('should reject empty chart_ids array', () => {
      const invalidData = {
        operation: 'clone',
        chart_ids: [],
      };

      const result = bulkOperationSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error?.issues?.[0]?.message).toBe('At least one chart ID required');
    });

    it('should reject too many chart IDs', () => {
      const tooManyCharts = Array.from(
        { length: 101 },
        (_, i) => `550e8400-e29b-41d4-a716-44665544${i.toString().padStart(4, '0')}`
      );

      const invalidData = {
        operation: 'clone',
        chart_ids: tooManyCharts,
      };

      const result = bulkOperationSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error?.issues?.[0]?.message).toBe('Too many charts');
    });

    it('should reject too many dashboard IDs', () => {
      const tooManyDashboards = Array.from(
        { length: 51 },
        (_, i) => `550e8400-e29b-41d4-a716-44665544${i.toString().padStart(4, '0')}`
      );

      const invalidData = {
        operation: 'clone',
        chart_ids: ['550e8400-e29b-41d4-a716-446655440000'],
        dashboard_ids: tooManyDashboards,
      };

      const result = bulkOperationSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error?.issues?.[0]?.message).toBe('Too many dashboards');
    });

    it('should reject invalid operation type', () => {
      const invalidData = {
        operation: 'invalid_op',
        chart_ids: ['550e8400-e29b-41d4-a716-446655440000'],
      };

      const result = bulkOperationSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error?.issues?.[0]?.path).toContain('operation');
    });

    it('should validate all operation types', () => {
      const validOperations = ['clone', 'delete', 'update', 'export'];

      validOperations.forEach((operation) => {
        const result = bulkOperationSchema.safeParse({
          operation,
          chart_ids: ['550e8400-e29b-41d4-a716-446655440000'],
        });
        expect(result.success).toBe(true);
      });
    });
  });

  describe('dataSourceSchema', () => {
    it('should validate correct data source configuration', () => {
      const validData = {
        source_name: 'Patient Database',
        connection_string: 'postgresql://user:pass@localhost:5432/patients',
        source_type: 'postgresql',
        credentials: { username: 'user', password: 'pass' },
        is_active: true,
      };

      const result = dataSourceSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should validate minimal data source', () => {
      const minimalData = {
        source_name: 'Simple DB',
        connection_string: 'mysql://localhost/db',
        source_type: 'mysql',
      };

      const result = dataSourceSchema.safeParse(minimalData);
      expect(result.success).toBe(true);
      expect(result.data?.is_active).toBe(true);
    });

    it('should reject empty source name', () => {
      const invalidData = {
        source_name: '',
        connection_string: 'postgresql://localhost/db',
        source_type: 'postgresql',
      };

      const result = dataSourceSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error?.issues?.[0]?.message).toBe('Name is required');
    });

    it('should reject empty connection string', () => {
      const invalidData = {
        source_name: 'Database',
        connection_string: '',
        source_type: 'postgresql',
      };

      const result = dataSourceSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error?.issues?.[0]?.message).toBe('Connection string required');
    });

    it('should reject invalid source type', () => {
      const invalidData = {
        source_name: 'Database',
        connection_string: 'postgresql://localhost/db',
        source_type: 'invalid_type',
      };

      const result = dataSourceSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error?.issues?.[0]?.path).toContain('source_type');
    });

    it('should validate all source types', () => {
      const validTypes = ['postgresql', 'mysql', 'mongodb', 'rest_api'];

      validTypes.forEach((type) => {
        const result = dataSourceSchema.safeParse({
          source_name: 'Test DB',
          connection_string: 'connection://string',
          source_type: type,
        });
        expect(result.success).toBe(true);
      });
    });
  });
});
