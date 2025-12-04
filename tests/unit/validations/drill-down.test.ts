/**
 * Drill-Down Validation Tests
 *
 * Tests for drill-down field validation in chart update schema.
 */

import { describe, it, expect } from 'vitest';
import { chartDefinitionUpdateSchema } from '@/lib/validations/analytics';

describe('drill-down validation', () => {
  describe('chartDefinitionUpdateSchema with drill-down fields', () => {
    it('accepts valid filter drill-down config', () => {
      const data = {
        chart_name: 'Test Chart',
        drill_down_enabled: true,
        drill_down_type: 'filter',
        drill_down_target_chart_id: null,
        drill_down_button_label: 'Filter',
      };

      const result = chartDefinitionUpdateSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it('accepts valid navigate drill-down config', () => {
      const data = {
        chart_name: 'Test Chart',
        drill_down_enabled: true,
        drill_down_type: 'navigate',
        drill_down_target_chart_id: '550e8400-e29b-41d4-a716-446655440000',
        drill_down_button_label: 'View Details',
      };

      const result = chartDefinitionUpdateSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it('accepts valid swap drill-down config', () => {
      const data = {
        chart_name: 'Test Chart',
        drill_down_enabled: true,
        drill_down_type: 'swap',
        drill_down_target_chart_id: '550e8400-e29b-41d4-a716-446655440000',
        drill_down_button_label: 'Swap Chart',
      };

      const result = chartDefinitionUpdateSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it('accepts disabled drill-down config', () => {
      const data = {
        chart_name: 'Test Chart',
        drill_down_enabled: false,
      };

      const result = chartDefinitionUpdateSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it('accepts null values for optional drill-down fields', () => {
      const data = {
        chart_name: 'Test Chart',
        drill_down_enabled: false,
        drill_down_type: null,
        drill_down_target_chart_id: null,
      };

      const result = chartDefinitionUpdateSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it('rejects invalid drill-down type', () => {
      const data = {
        chart_name: 'Test Chart',
        drill_down_enabled: true,
        drill_down_type: 'invalid_type',
      };

      const result = chartDefinitionUpdateSchema.safeParse(data);

      expect(result.success).toBe(false);
      if (!result.success) {
        const typeError = result.error.issues.find(
          (issue) => issue.path.includes('drill_down_type')
        );
        expect(typeError).toBeDefined();
      }
    });

    it('rejects invalid target chart ID format', () => {
      const data = {
        chart_name: 'Test Chart',
        drill_down_enabled: true,
        drill_down_type: 'navigate',
        drill_down_target_chart_id: 'not-a-uuid',
      };

      const result = chartDefinitionUpdateSchema.safeParse(data);

      expect(result.success).toBe(false);
      if (!result.success) {
        const idError = result.error.issues.find(
          (issue) => issue.path.includes('drill_down_target_chart_id')
        );
        expect(idError).toBeDefined();
      }
    });

    it('rejects button label exceeding max length', () => {
      const data = {
        chart_name: 'Test Chart',
        drill_down_enabled: true,
        drill_down_type: 'filter',
        drill_down_button_label: 'A'.repeat(51), // Max is 50
      };

      const result = chartDefinitionUpdateSchema.safeParse(data);

      expect(result.success).toBe(false);
      if (!result.success) {
        const labelError = result.error.issues.find(
          (issue) => issue.path.includes('drill_down_button_label')
        );
        expect(labelError).toBeDefined();
      }
    });

    it('accepts button label at max length', () => {
      const data = {
        chart_name: 'Test Chart',
        drill_down_enabled: true,
        drill_down_type: 'filter',
        drill_down_button_label: 'A'.repeat(50), // Exactly 50 chars
      };

      const result = chartDefinitionUpdateSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it('allows partial updates with only drill-down fields', () => {
      const data = {
        drill_down_enabled: true,
        drill_down_type: 'filter',
      };

      const result = chartDefinitionUpdateSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it('preserves other chart fields alongside drill-down config', () => {
      const data = {
        chart_name: 'Updated Chart Name',
        chart_type: 'bar',
        drill_down_enabled: true,
        drill_down_type: 'navigate',
        drill_down_target_chart_id: '550e8400-e29b-41d4-a716-446655440000',
        drill_down_button_label: 'Explore',
      };

      const result = chartDefinitionUpdateSchema.safeParse(data);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.chart_name).toBe('Updated Chart Name');
        expect(result.data.chart_type).toBe('bar');
        expect(result.data.drill_down_enabled).toBe(true);
        expect(result.data.drill_down_type).toBe('navigate');
      }
    });
  });
});




