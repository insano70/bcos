/**
 * Field Completion Validator Unit Tests
 *
 * Tests the validation logic for required-to-complete custom fields
 * before allowing work items to transition to completed status.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateForCompletion } from '@/lib/services/work-items/field-completion-validator';
import { db } from '@/lib/db';

// Mock the database
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
  },
}));

describe('Field Completion Validator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateForCompletion', () => {
    it('should pass validation when no fields are required to complete', async () => {
      // Mock: No required fields for this work item type
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]), // Empty array = no required fields
      };
      vi.mocked(db.select).mockReturnValue(mockSelect as never);

      const result = await validateForCompletion('work-item-1', 'type-1');

      expect(result.isValid).toBe(true);
      expect(result.missingFields).toEqual([]);
      expect(result.errorMessage).toBeUndefined();
    });

    it('should pass validation when all required fields are filled', async () => {
      const workItemId = 'work-item-1';
      const typeId = 'type-1';

      // First call: Get required fields
      const requiredFieldsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          {
            work_item_field_id: 'field-1',
            field_name: 'project_code',
            field_label: 'Project Code',
            field_type: 'text',
          },
          {
            work_item_field_id: 'field-2',
            field_name: 'completion_date',
            field_label: 'Completion Date',
            field_type: 'date',
          },
        ]),
      };

      // Second call: Get field values
      const fieldValuesSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          { work_item_field_id: 'field-1', field_value: 'PRJ-123' },
          { work_item_field_id: 'field-2', field_value: '2024-10-26' },
        ]),
      };

      vi.mocked(db.select)
        .mockReturnValueOnce(requiredFieldsSelect as never)
        .mockReturnValueOnce(fieldValuesSelect as never);

      const result = await validateForCompletion(workItemId, typeId);

      expect(result.isValid).toBe(true);
      expect(result.missingFields).toEqual([]);
      expect(result.errorMessage).toBeUndefined();
    });

    it('should fail validation when required field is completely missing', async () => {
      const workItemId = 'work-item-1';
      const typeId = 'type-1';

      // Required fields
      const requiredFieldsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          {
            work_item_field_id: 'field-1',
            field_name: 'project_code',
            field_label: 'Project Code',
            field_type: 'text',
          },
        ]),
      };

      // Field values - missing field-1
      const fieldValuesSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };

      vi.mocked(db.select)
        .mockReturnValueOnce(requiredFieldsSelect as never)
        .mockReturnValueOnce(fieldValuesSelect as never);

      const result = await validateForCompletion(workItemId, typeId);

      expect(result.isValid).toBe(false);
      expect(result.missingFields).toHaveLength(1);
      expect(result.missingFields[0]).toMatchObject({
        field_id: 'field-1',
        field_name: 'project_code',
        field_label: 'Project Code',
        reason: 'missing',
      });
      expect(result.errorMessage).toContain('Project Code');
      expect(result.errorMessage).toContain('Cannot complete work item');
    });

    it('should fail validation when required text field is empty string', async () => {
      const workItemId = 'work-item-1';
      const typeId = 'type-1';

      const requiredFieldsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          {
            work_item_field_id: 'field-1',
            field_name: 'notes',
            field_label: 'Completion Notes',
            field_type: 'text',
          },
        ]),
      };

      const fieldValuesSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          { work_item_field_id: 'field-1', field_value: '   ' }, // Whitespace only
        ]),
      };

      vi.mocked(db.select)
        .mockReturnValueOnce(requiredFieldsSelect as never)
        .mockReturnValueOnce(fieldValuesSelect as never);

      const result = await validateForCompletion(workItemId, typeId);

      expect(result.isValid).toBe(false);
      expect(result.missingFields).toHaveLength(1);
      expect(result.missingFields[0]?.reason).toBe('empty');
    });

    it('should fail validation with multiple missing fields and format error message correctly', async () => {
      const workItemId = 'work-item-1';
      const typeId = 'type-1';

      const requiredFieldsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          {
            work_item_field_id: 'field-1',
            field_name: 'project_code',
            field_label: 'Project Code',
            field_type: 'text',
          },
          {
            work_item_field_id: 'field-2',
            field_name: 'completion_date',
            field_label: 'Completion Date',
            field_type: 'date',
          },
          {
            work_item_field_id: 'field-3',
            field_name: 'final_cost',
            field_label: 'Final Cost',
            field_type: 'number',
          },
        ]),
      };

      const fieldValuesSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          { work_item_field_id: 'field-1', field_value: 'PRJ-123' }, // Only field-1 is filled
        ]),
      };

      vi.mocked(db.select)
        .mockReturnValueOnce(requiredFieldsSelect as never)
        .mockReturnValueOnce(fieldValuesSelect as never);

      const result = await validateForCompletion(workItemId, typeId);

      expect(result.isValid).toBe(false);
      expect(result.missingFields).toHaveLength(2);
      expect(result.errorMessage).toContain('"Completion Date"');
      expect(result.errorMessage).toContain('"Final Cost"');
      expect(result.errorMessage).toContain('Cannot complete work item');
    });

    it('should treat checkbox false as valid (not empty)', async () => {
      const workItemId = 'work-item-1';
      const typeId = 'type-1';

      const requiredFieldsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          {
            work_item_field_id: 'field-1',
            field_name: 'terms_accepted',
            field_label: 'Terms Accepted',
            field_type: 'checkbox',
          },
        ]),
      };

      const fieldValuesSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          { work_item_field_id: 'field-1', field_value: false }, // false is valid for checkboxes
        ]),
      };

      vi.mocked(db.select)
        .mockReturnValueOnce(requiredFieldsSelect as never)
        .mockReturnValueOnce(fieldValuesSelect as never);

      const result = await validateForCompletion(workItemId, typeId);

      expect(result.isValid).toBe(true);
      expect(result.missingFields).toEqual([]);
    });

    it('should treat number zero as valid (not empty)', async () => {
      const workItemId = 'work-item-1';
      const typeId = 'type-1';

      const requiredFieldsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          {
            work_item_field_id: 'field-1',
            field_name: 'error_count',
            field_label: 'Error Count',
            field_type: 'number',
          },
        ]),
      };

      const fieldValuesSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          { work_item_field_id: 'field-1', field_value: 0 }, // 0 is valid for numbers
        ]),
      };

      vi.mocked(db.select)
        .mockReturnValueOnce(requiredFieldsSelect as never)
        .mockReturnValueOnce(fieldValuesSelect as never);

      const result = await validateForCompletion(workItemId, typeId);

      expect(result.isValid).toBe(true);
      expect(result.missingFields).toEqual([]);
    });

    it('should validate dropdown fields correctly', async () => {
      const workItemId = 'work-item-1';
      const typeId = 'type-1';

      const requiredFieldsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          {
            work_item_field_id: 'field-1',
            field_name: 'resolution',
            field_label: 'Resolution',
            field_type: 'dropdown',
          },
        ]),
      };

      const fieldValuesSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          { work_item_field_id: 'field-1', field_value: 'resolved' },
        ]),
      };

      vi.mocked(db.select)
        .mockReturnValueOnce(requiredFieldsSelect as never)
        .mockReturnValueOnce(fieldValuesSelect as never);

      const result = await validateForCompletion(workItemId, typeId);

      expect(result.isValid).toBe(true);
    });

    it('should validate user_picker fields correctly', async () => {
      const workItemId = 'work-item-1';
      const typeId = 'type-1';

      const requiredFieldsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          {
            work_item_field_id: 'field-1',
            field_name: 'approver',
            field_label: 'Approver',
            field_type: 'user_picker',
          },
        ]),
      };

      const fieldValuesSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          { work_item_field_id: 'field-1', field_value: 'user-uuid-123' },
        ]),
      };

      vi.mocked(db.select)
        .mockReturnValueOnce(requiredFieldsSelect as never)
        .mockReturnValueOnce(fieldValuesSelect as never);

      const result = await validateForCompletion(workItemId, typeId);

      expect(result.isValid).toBe(true);
    });

    it('should validate datetime fields correctly', async () => {
      const workItemId = 'work-item-1';
      const typeId = 'type-1';

      const requiredFieldsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          {
            work_item_field_id: 'field-1',
            field_name: 'completed_at',
            field_label: 'Completed At',
            field_type: 'datetime',
          },
        ]),
      };

      const fieldValuesSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          { work_item_field_id: 'field-1', field_value: '2024-10-26T10:30:00Z' },
        ]),
      };

      vi.mocked(db.select)
        .mockReturnValueOnce(requiredFieldsSelect as never)
        .mockReturnValueOnce(fieldValuesSelect as never);

      const result = await validateForCompletion(workItemId, typeId);

      expect(result.isValid).toBe(true);
    });
  });
});
