-- Migration: Create work_item_fields and work_item_field_values tables
-- Description: Add support for custom fields on work items
-- Author: Claude
-- Date: 2025-10-07

-- Create work_item_fields table
CREATE TABLE IF NOT EXISTS work_item_fields (
  work_item_field_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign Keys
  work_item_type_id UUID NOT NULL REFERENCES work_item_types(work_item_type_id) ON DELETE CASCADE,

  -- Field Configuration
  field_name VARCHAR(100) NOT NULL,
  field_label VARCHAR(255) NOT NULL,
  field_type VARCHAR(50) NOT NULL,
  field_description TEXT,

  -- Field Options (for dropdown, multi_select)
  field_options JSONB,

  -- Validation Rules
  is_required BOOLEAN DEFAULT false,
  validation_rules JSONB,
  default_value TEXT,

  -- Display Configuration
  display_order INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN DEFAULT true,

  -- Metadata
  created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Create indexes for work_item_fields
CREATE INDEX idx_work_item_fields_type ON work_item_fields(work_item_type_id);
CREATE INDEX idx_work_item_fields_created_by ON work_item_fields(created_by);
CREATE INDEX idx_work_item_fields_deleted_at ON work_item_fields(deleted_at);
CREATE INDEX idx_work_item_fields_display_order ON work_item_fields(display_order);
CREATE INDEX idx_work_item_fields_type_visible ON work_item_fields(work_item_type_id, is_visible);
CREATE INDEX idx_work_item_fields_type_order ON work_item_fields(work_item_type_id, display_order);

-- Create work_item_field_values table
CREATE TABLE IF NOT EXISTS work_item_field_values (
  work_item_field_value_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign Keys
  work_item_id UUID NOT NULL REFERENCES work_items(work_item_id) ON DELETE CASCADE,
  work_item_field_id UUID NOT NULL REFERENCES work_item_fields(work_item_field_id) ON DELETE CASCADE,

  -- Field Value (stored as JSONB to support all types)
  field_value JSONB NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for work_item_field_values
CREATE INDEX idx_work_item_field_values_work_item ON work_item_field_values(work_item_id);
CREATE INDEX idx_work_item_field_values_field ON work_item_field_values(work_item_field_id);
CREATE INDEX idx_work_item_field_values_work_item_field ON work_item_field_values(work_item_id, work_item_field_id);

-- Add comments for documentation
COMMENT ON TABLE work_item_fields IS 'Defines custom field configurations for work item types';
COMMENT ON COLUMN work_item_fields.work_item_field_id IS 'Unique identifier for custom field definition';
COMMENT ON COLUMN work_item_fields.work_item_type_id IS 'Work item type this field belongs to';
COMMENT ON COLUMN work_item_fields.field_type IS 'Type of field: text, number, date, dropdown, checkbox, user_picker';
COMMENT ON COLUMN work_item_fields.field_options IS 'Options for dropdown/multi_select fields';
COMMENT ON COLUMN work_item_fields.validation_rules IS 'JSON validation rules: min, max, pattern, etc';
COMMENT ON COLUMN work_item_fields.display_order IS 'Order in which field appears in forms';
COMMENT ON COLUMN work_item_fields.deleted_at IS 'Soft delete timestamp - NULL means active';

COMMENT ON TABLE work_item_field_values IS 'Stores custom field values for work items';
COMMENT ON COLUMN work_item_field_values.work_item_field_value_id IS 'Unique identifier for field value';
COMMENT ON COLUMN work_item_field_values.field_value IS 'JSONB value supporting all field types';
