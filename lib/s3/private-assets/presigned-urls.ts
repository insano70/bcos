import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { log } from '@/lib/logger';
import { getBucketName, getExpirationConfig, getS3Client, isS3Configured } from './client';
import { ALLOWED_MIME_TYPES, DEFAULT_MAX_FILE_SIZE, MAX_FILE_SIZE_LIMIT } from './constants';
import type {
  PresignedDownloadOptions,
  PresignedDownloadResult,
  PresignedUploadOptions,
  PresignedUploadResult,
} from './types';

/**
 * Validate content type against allowed MIME types whitelist
 * 
 * @param contentType - MIME type to validate
 * @throws Error if content type is not allowed
 */
function validateContentType(contentType: string): void {
  if (!ALLOWED_MIME_TYPES.has(contentType)) {
    const allowedTypes = Array.from(ALLOWED_MIME_TYPES).slice(0, 10).join(', ');
    throw new Error(
      `Unsupported content type: ${contentType}. Allowed types include: ${allowedTypes}... (see documentation for full list)`
    );
  }
}

/**
 * Validate file size limit
 * 
 * @param maxFileSize - Maximum file size in bytes
 * @throws Error if file size exceeds limits
 */
function validateFileSize(maxFileSize: number): void {
  if (maxFileSize < 1) {
    throw new Error('maxFileSize must be at least 1 byte');
  }

  if (maxFileSize > MAX_FILE_SIZE_LIMIT) {
    throw new Error(
      `maxFileSize cannot exceed ${MAX_FILE_SIZE_LIMIT / 1024 / 1024}MB (${MAX_FILE_SIZE_LIMIT} bytes)`
    );
  }
}

/**
 * Generate presigned URL for uploading a file to S3
 * 
 * The client will use this URL to upload directly to S3 without going through the server.
 * This reduces server bandwidth and allows parallel uploads.
 * 
 * @param s3Key - S3 key where file will be stored
 * @param options - Upload options including content type and metadata
 * @returns Presigned upload URL result with uploadUrl, s3Key, expiresIn, and bucket
 * @throws Error if S3 is not configured or URL generation fails
 * 
 * @example
 * // Work item attachment
 * const { uploadUrl, s3Key } = await generateUploadUrl(
 *   'work-items/abc-123/attachments/document_xyz.pdf',
 *   {
 *     contentType: 'application/pdf',
 *     expiresIn: 3600,
 *     metadata: {
 *       resource_type: 'work_item_attachment',
 *       resource_id: 'abc-123',
 *       uploaded_by: 'user-456'
 *     }
 *   }
 * );
 * 
 * // Client uploads file
 * await fetch(uploadUrl, {
 *   method: 'PUT',
 *   body: file,
 *   headers: { 'Content-Type': 'application/pdf' }
 * });
 * 
 * @example
 * // Invoice upload
 * const { uploadUrl } = await generateUploadUrl(
 *   'invoices/org-456/2024/invoice-jan.pdf',
 *   {
 *     contentType: 'application/pdf',
 *     metadata: {
 *       resource_type: 'invoice',
 *       organization_id: 'org-456',
 *       period: '2024-01'
 *     }
 *   }
 * );
 */
export async function generateUploadUrl(
  s3Key: string,
  options: PresignedUploadOptions
): Promise<PresignedUploadResult> {
  const startTime = Date.now();

  if (!isS3Configured()) {
    throw new Error(
      'S3 private assets not configured. Cannot generate upload URL. Required: S3_PRIVATE_REGION, S3_PRIVATE_ACCESS_KEY_ID, S3_PRIVATE_SECRET_ACCESS_KEY, S3_PRIVATE_BUCKET'
    );
  }

  const client = getS3Client();
  const bucket = getBucketName();
  const expirationConfig = getExpirationConfig();

  const {
    contentType,
    expiresIn = expirationConfig.uploadExpiration,
    maxFileSize = DEFAULT_MAX_FILE_SIZE,
    metadata = {},
    cacheControl = 'private, no-cache',
  } = options;

  // Validate content type against whitelist
  validateContentType(contentType);

  // Validate expiration time
  if (expiresIn < 60 || expiresIn > 86400) {
    throw new Error('expiresIn must be between 60 seconds (1 min) and 86400 seconds (24 hours)');
  }

  // Validate file size limit
  validateFileSize(maxFileSize);

  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      ContentType: contentType,
      CacheControl: cacheControl,
      Metadata: {
        ...metadata,
        max_file_size: String(maxFileSize), // Track limit in metadata
      },
    });

    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn,
    });

    const duration = Date.now() - startTime;

    log.info('Generated presigned upload URL', {
      operation: 'generate_upload_url',
      s3Key,
      bucket,
      contentType,
      expiresIn,
      maxFileSize,
      maxFileSizeMB: Math.round(maxFileSize / 1024 / 1024),
      hasMetadata: Object.keys(metadata).length > 0,
      duration,
      component: 's3-private-assets',
    });

    return {
      uploadUrl,
      s3Key,
      expiresIn,
      bucket,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Failed to generate presigned upload URL', error, {
      operation: 'generate_upload_url',
      s3Key,
      bucket,
      contentType,
      duration,
      component: 's3-private-assets',
    });
    throw new Error('Failed to generate presigned upload URL');
  }
}

/**
 * Generate presigned URL for downloading a file from S3
 * 
 * The client will use this URL to download directly from S3 without going through the server.
 * URLs are short-lived (default 15 minutes) for security.
 * 
 * @param s3Key - S3 key of the file to download
 * @param options - Download options including fileName and expiration
 * @returns Presigned download URL result with downloadUrl, expiresIn, and expiresAt
 * @throws Error if S3 is not configured or URL generation fails
 * 
 * @example
 * // Work item attachment download
 * const { downloadUrl, expiresAt } = await generateDownloadUrl(
 *   'work-items/abc-123/attachments/document_xyz.pdf',
 *   {
 *     fileName: 'project-document.pdf',
 *     expiresIn: 900 // 15 minutes
 *   }
 * );
 * 
 * // Return URL to client
 * res.json({ downloadUrl, expiresAt });
 * 
 * @example
 * // Invoice download (inline display)
 * const { downloadUrl } = await generateDownloadUrl(
 *   'invoices/org-456/2024/invoice-jan.pdf',
 *   {
 *     fileName: 'Invoice-January-2024.pdf',
 *     disposition: 'inline', // Open in browser instead of download
 *     expiresIn: 600 // 10 minutes
 *   }
 * );
 * 
 * @example
 * // Report download (minimal options)
 * const { downloadUrl } = await generateDownloadUrl(
 *   'reports/org-789/analytics/report_xyz.xlsx'
 * );
 */
export async function generateDownloadUrl(
  s3Key: string,
  options: PresignedDownloadOptions = {}
): Promise<PresignedDownloadResult> {
  const startTime = Date.now();

  if (!isS3Configured()) {
    throw new Error(
      'S3 private assets not configured. Cannot generate download URL. Required: S3_PRIVATE_REGION, S3_PRIVATE_ACCESS_KEY_ID, S3_PRIVATE_SECRET_ACCESS_KEY, S3_PRIVATE_BUCKET'
    );
  }

  const client = getS3Client();
  const bucket = getBucketName();
  const expirationConfig = getExpirationConfig();

  const { fileName, expiresIn = expirationConfig.downloadExpiration, disposition = 'attachment' } = options;

  // Validate expiration time
  if (expiresIn < 60 || expiresIn > 3600) {
    throw new Error('expiresIn must be between 60 seconds (1 min) and 3600 seconds (1 hour)');
  }

  try {
    const commandOptions: {
      Bucket: string;
      Key: string;
      ResponseContentDisposition?: string;
    } = {
      Bucket: bucket,
      Key: s3Key,
    };

    // Add Content-Disposition header if filename provided
    if (fileName) {
      // Sanitize filename for Content-Disposition header
      const sanitizedFileName = fileName.replace(/[^\w\s.-]/g, '_');
      commandOptions.ResponseContentDisposition = `${disposition}; filename="${sanitizedFileName}"`;
    }

    const command = new GetObjectCommand(commandOptions);

    const downloadUrl = await getSignedUrl(client, command, {
      expiresIn,
    });

    const duration = Date.now() - startTime;
    const expiresAt = Date.now() + expiresIn * 1000;

    log.info('Generated presigned download URL', {
      operation: 'generate_download_url',
      s3Key,
      bucket,
      fileName: fileName || null,
      disposition,
      expiresIn,
      expiresAt: new Date(expiresAt).toISOString(),
      duration,
      component: 's3-private-assets',
    });

    return {
      downloadUrl,
      expiresIn,
      expiresAt,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Failed to generate presigned download URL', error, {
      operation: 'generate_download_url',
      s3Key,
      bucket,
      fileName: fileName || null,
      duration,
      component: 's3-private-assets',
    });
    throw new Error('Failed to generate presigned download URL');
  }
}

