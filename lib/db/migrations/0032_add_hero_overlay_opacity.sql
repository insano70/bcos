-- Migration: Add Hero Overlay Opacity to Practice Attributes
-- Description: Adds configurable opacity control for hero banner image overlay
-- Author: Claude
-- Date: 2025-01-23
--
-- Purpose: Allow practices to configure the opacity of the hero image overlay
-- from 0.0 (fully transparent) to 1.0 (fully opaque) with decimal precision.
-- Default: 0.1 (10% opacity) maintains current behavior.

-- Add hero_overlay_opacity column to practice_attributes table
ALTER TABLE practice_attributes
  ADD COLUMN hero_overlay_opacity NUMERIC(4,3) DEFAULT 0.1;

-- Add constraint to ensure valid range (0.0 to 1.0)
ALTER TABLE practice_attributes
  ADD CONSTRAINT hero_overlay_opacity_range
  CHECK (hero_overlay_opacity >= 0 AND hero_overlay_opacity <= 1);

-- Add comment for documentation
COMMENT ON COLUMN practice_attributes.hero_overlay_opacity IS
  'Opacity of the hero banner image overlay. Range: 0.0 (transparent) to 1.0 (opaque). Default: 0.1. Supports up to 3 decimal places for fine-grained control.';
