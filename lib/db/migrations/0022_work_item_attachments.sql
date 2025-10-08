-- Migration: Create work_item_attachments table (Phase 5)
-- Description: File attachment support with S3 storage
-- Author: Engineering Team
-- Date: 2025-10-08

-- Create work_item_attachments table
CREATE TABLE IF NOT EXISTS work_item_attachments (
  work_item_attachment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES work_items(work_item_id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 104857600),
  file_type TEXT NOT NULL,
  s3_key TEXT NOT NULL UNIQUE,
  s3_bucket TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(user_id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_attachments_work_item ON work_item_attachments(work_item_id);
CREATE INDEX IF NOT EXISTS idx_attachments_uploaded_by ON work_item_attachments(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_attachments_uploaded_at ON work_item_attachments(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_attachments_deleted_at ON work_item_attachments(deleted_at);

-- Add comments for documentation
COMMENT ON TABLE work_item_attachments IS 'File attachments for work items stored in S3';
COMMENT ON COLUMN work_item_attachments.s3_key IS 'S3 object key: work-items/{work_item_id}/attachments/{attachment_id}/{filename}';
COMMENT ON COLUMN work_item_attachments.file_size IS 'File size in bytes, max 100MB (104857600 bytes)';
COMMENT ON COLUMN work_item_attachments.file_type IS 'MIME type of the uploaded file';
COMMENT ON COLUMN work_item_attachments.uploaded_at IS 'Timestamp when file was uploaded to S3';
COMMENT ON COLUMN work_item_attachments.deleted_at IS 'Soft delete timestamp - NULL means active';
