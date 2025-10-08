-- Migration: Add dual_axis_config column to chart_definitions table
-- This supports dual-axis combo charts (bar + line) with separate y-axes

-- Add dual_axis_config column to store dual-axis chart configuration
ALTER TABLE chart_definitions
ADD COLUMN dual_axis_config JSONB DEFAULT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN chart_definitions.dual_axis_config IS 'Dual-axis configuration for combo charts. Structure: { "enabled": boolean, "primary": { "measure": string, "chartType": "bar", "axisLabel"?: string, "axisPosition": "left" }, "secondary": { "measure": string, "chartType": "line" | "bar", "axisLabel"?: string, "axisPosition": "right" } }';

-- Create index for querying charts with dual-axis enabled
CREATE INDEX idx_chart_definitions_dual_axis_enabled ON chart_definitions ((dual_axis_config->>'enabled'))
WHERE dual_axis_config IS NOT NULL AND (dual_axis_config->>'enabled')::boolean = true;
