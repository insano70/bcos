/**
 * S3 Public Assets Service
 *
 * Generic, reusable service for uploading public assets to S3 with CloudFront CDN.
 * Supports any asset type with flexible path composition.
 *
 * @example
 * // Practice logo upload
 * import { generateS3Key, uploadToS3, getPublicUrl } from '@/lib/s3/public-assets';
 *
 * const buffer = await file.arrayBuffer().then(ab => Buffer.from(ab));
 * const s3Key = generateS3Key(['practices', practiceId, 'logo'], 'logo.jpg');
 * const result = await uploadToS3(buffer, s3Key, { contentType: 'image/jpeg' });
 * console.log(result.fileUrl); // 'https://cdn.bendcare.com/practices/123/logo/logo_xyz.jpg'
 *
 * @example
 * // User avatar upload
 * const s3Key = generateS3Key(['users', userId, 'avatar'], 'photo.png');
 * const result = await uploadToS3(buffer, s3Key, { contentType: 'image/png' });
 *
 * @example
 * // Check if S3 is configured
 * import { isS3Configured } from '@/lib/s3/public-assets';
 *
 * if (isS3Configured()) {
 *   // Use S3 upload
 * } else {
 *   // Fall back to local filesystem
 * }
 */

// Client and configuration
export { isS3Configured, getBucketName, getCdnUrl } from './client';

// Key generation
export { generateS3Key } from './key-generator';

// Upload operations
export { uploadToS3, deleteFromS3, fileExistsInS3 } from './upload';

// URL utilities
export { getPublicUrl, extractS3Key, isCloudFrontUrl, isLocalUrl } from './url-utils';

// Types
export type { GenerateKeyOptions, UploadOptions, UploadResult } from './types';
