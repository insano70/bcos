import { z } from 'zod';

/**
 * File size limit: 100MB in bytes
 */
export const MAX_FILE_SIZE = 104857600; // 100MB

/**
 * Allowed file types for work item attachments
 * Extensible list of common business file formats
 */
export const ALLOWED_FILE_TYPES = [
  // Images
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  // Text
  'text/plain',
  'text/csv',
  'text/markdown',
  // Archives
  'application/zip',
  'application/x-zip-compressed',
  'application/x-gzip',
  'application/x-tar',
] as const;

/**
 * Schema for uploading a work item attachment
 * Used to validate file metadata before generating upload URL
 */
export const workItemAttachmentUploadSchema = z.object({
  work_item_id: z.string().uuid('Invalid work item ID'),
  file_name: z
    .string()
    .min(1, 'File name required')
    .max(500, 'File name too long')
    .refine((name) => name.trim().length > 0, 'File name cannot be empty'),
  file_size: z
    .number()
    .int('File size must be an integer')
    .positive('File size must be positive')
    .max(MAX_FILE_SIZE, `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`),
  file_type: z
    .string()
    .min(1, 'File type required')
    .refine(
      (type) => ALLOWED_FILE_TYPES.includes(type as (typeof ALLOWED_FILE_TYPES)[number]),
      'File type not allowed'
    ),
});

export type WorkItemAttachmentUpload = z.infer<typeof workItemAttachmentUploadSchema>;

/**
 * Schema for querying work item attachments
 */
export const workItemAttachmentQuerySchema = z.object({
  work_item_id: z.string().uuid('Invalid work item ID').optional(),
  file_type: z.string().optional(),
  limit: z.coerce.number().int().positive().max(1000).default(1000).optional(),
  offset: z.coerce.number().int().min(0).default(0).optional(),
});

export type WorkItemAttachmentQuery = z.infer<typeof workItemAttachmentQuerySchema>;

/**
 * Schema for attachment ID parameter validation
 */
export const workItemAttachmentParamsSchema = z.object({
  id: z.string().uuid('Invalid attachment ID'),
});

export type WorkItemAttachmentParams = z.infer<typeof workItemAttachmentParamsSchema>;

/**
 * Schema for confirming successful upload
 * Client calls this after uploading to S3 with presigned URL
 */
export const workItemAttachmentConfirmSchema = z.object({
  work_item_attachment_id: z.string().uuid('Invalid attachment ID'),
  work_item_id: z.string().uuid('Invalid work item ID'),
});

export type WorkItemAttachmentConfirm = z.infer<typeof workItemAttachmentConfirmSchema>;

/**
 * Schema for uploading a field attachment
 * Used to validate file metadata before generating upload URL for custom field attachments
 */
export const fieldAttachmentUploadSchema = z.object({
  work_item_id: z.string().uuid('Invalid work item ID'),
  work_item_field_id: z.string().uuid('Invalid field ID'),
  file_name: z
    .string()
    .min(1, 'File name required')
    .max(500, 'File name too long')
    .refine((name) => name.trim().length > 0, 'File name cannot be empty'),
  file_size: z
    .number()
    .int('File size must be an integer')
    .positive('File size must be positive')
    .max(MAX_FILE_SIZE, `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`),
  file_type: z
    .string()
    .min(1, 'File type required')
    .refine(
      (type) => ALLOWED_FILE_TYPES.includes(type as (typeof ALLOWED_FILE_TYPES)[number]),
      'File type not allowed'
    ),
});

export type FieldAttachmentUpload = z.infer<typeof fieldAttachmentUploadSchema>;

/**
 * Schema for field attachment path parameters
 */
export const fieldAttachmentParamsSchema = z.object({
  id: z.string().uuid('Invalid work item ID'),
  fieldId: z.string().uuid('Invalid field ID'),
});

export type FieldAttachmentParams = z.infer<typeof fieldAttachmentParamsSchema>;

/**
 * Schema for specific field attachment parameters
 */
export const fieldAttachmentDetailParamsSchema = z.object({
  id: z.string().uuid('Invalid work item ID'),
  fieldId: z.string().uuid('Invalid field ID'),
  attachmentId: z.string().uuid('Invalid attachment ID'),
});

export type FieldAttachmentDetailParams = z.infer<typeof fieldAttachmentDetailParamsSchema>;
