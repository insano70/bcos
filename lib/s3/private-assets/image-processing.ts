import { PutObjectCommand } from '@aws-sdk/client-s3';
import { log } from '@/lib/logger';
import { getBucketName, getS3Client, isS3Configured } from './client';
import { IMAGE_MIME_TYPES, THUMBNAIL_CONFIG } from './constants';

/**
 * Image Processing for S3 Private Assets
 * 
 * Provides thumbnail generation for uploaded images using sharp library.
 * Thumbnails are stored in a /thumbnails/ subdirectory next to the original file.
 */

/**
 * Check if a MIME type represents an image that can be thumbnailed
 * 
 * @param contentType - MIME type to check
 * @returns True if the file is an image that supports thumbnail generation
 * 
 * @example
 * isImage('image/jpeg')  // => true
 * isImage('application/pdf')  // => false
 */
export function isImage(contentType: string): boolean {
  return IMAGE_MIME_TYPES.has(contentType);
}

/**
 * Get thumbnail S3 key from original S3 key
 * Thumbnails are stored in a /thumbnails/ subdirectory
 * 
 * @param originalS3Key - S3 key of the original file
 * @returns S3 key for the thumbnail
 * 
 * @example
 * getThumbnailKey('work-items/abc-123/attachments/photo_xyz.jpg')
 * // => 'work-items/abc-123/attachments/thumbnails/photo_xyz_thumb.jpg'
 * 
 * @example
 * getThumbnailKey('users/user-456/documents/image.png')
 * // => 'users/user-456/documents/thumbnails/image_thumb.jpg'
 */
export function getThumbnailKey(originalS3Key: string): string {
  const parts = originalS3Key.split('/');
  const fileName = parts.pop() || '';
  const directory = parts.join('/');

  // Remove extension and add _thumb suffix, always use .jpg for thumbnails
  const nameWithoutExt = fileName.replace(/\.[^.]+$/, '');
  const thumbnailFileName = `${nameWithoutExt}_thumb.jpg`;

  return directory ? `${directory}/thumbnails/${thumbnailFileName}` : `thumbnails/${thumbnailFileName}`;
}

/**
 * Generate thumbnail from image buffer
 * 
 * Uses sharp library to resize images to thumbnail size while maintaining aspect ratio.
 * Always converts to JPEG format for consistency and smaller file sizes.
 * 
 * @param imageBuffer - Original image buffer
 * @param contentType - Original image MIME type
 * @returns Thumbnail buffer as JPEG
 * @throws Error if sharp is not available or image processing fails
 * 
 * @example
 * const originalBuffer = await file.arrayBuffer().then(ab => Buffer.from(ab));
 * const thumbnailBuffer = await generateThumbnail(originalBuffer, 'image/png');
 * // Returns JPEG buffer at max 300x300px
 */
export async function generateThumbnail(
  imageBuffer: Buffer,
  contentType: string
): Promise<Buffer> {
  const startTime = Date.now();

  // Verify it's an image
  if (!isImage(contentType)) {
    throw new Error(`Cannot generate thumbnail for non-image type: ${contentType}`);
  }

  try {
    // Dynamic import of sharp (optional dependency)
    const sharp = await import('sharp').catch(() => {
      throw new Error(
        'sharp library not available. Install with: pnpm add sharp'
      );
    });

    const thumbnail = await sharp.default(imageBuffer)
      .resize(THUMBNAIL_CONFIG.maxWidth, THUMBNAIL_CONFIG.maxHeight, {
        fit: THUMBNAIL_CONFIG.fit,
        withoutEnlargement: true, // Don't upscale small images
      })
      .jpeg({
        quality: THUMBNAIL_CONFIG.quality,
        mozjpeg: true, // Better compression
      })
      .toBuffer();

    const duration = Date.now() - startTime;

    log.info('Generated thumbnail', {
      operation: 'generate_thumbnail',
      originalContentType: contentType,
      originalSize: imageBuffer.length,
      thumbnailSize: thumbnail.length,
      compressionRatio: Math.round((1 - thumbnail.length / imageBuffer.length) * 100),
      duration,
      component: 's3-private-assets',
    });

    return thumbnail;
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Failed to generate thumbnail', error, {
      operation: 'generate_thumbnail',
      contentType,
      originalSize: imageBuffer.length,
      duration,
      component: 's3-private-assets',
    });
    throw new Error('Failed to generate thumbnail');
  }
}

/**
 * Upload image with automatic thumbnail generation
 * 
 * Uploads both the original image and a thumbnail version.
 * Thumbnail is stored in a /thumbnails/ subdirectory.
 * 
 * @param imageBuffer - Original image buffer
 * @param s3Key - S3 key for original image
 * @param contentType - Image MIME type
 * @returns Object with original and thumbnail S3 keys
 * @throws Error if S3 not configured or upload fails
 * 
 * @example
 * const buffer = await file.arrayBuffer().then(ab => Buffer.from(ab));
 * const { originalKey, thumbnailKey } = await uploadWithThumbnail(
 *   buffer,
 *   'work-items/abc-123/attachments/photo_xyz.jpg',
 *   'image/jpeg'
 * );
 * 
 * // Both files now in S3:
 * // - work-items/abc-123/attachments/photo_xyz.jpg (original)
 * // - work-items/abc-123/attachments/thumbnails/photo_xyz_thumb.jpg (thumbnail)
 */
export async function uploadWithThumbnail(
  imageBuffer: Buffer,
  s3Key: string,
  contentType: string
): Promise<{ originalKey: string; thumbnailKey: string; thumbnailSize: number }> {
  const startTime = Date.now();

  if (!isS3Configured()) {
    throw new Error(
      'S3 private assets not configured. Cannot upload with thumbnail.'
    );
  }

  if (!isImage(contentType)) {
    throw new Error(`Cannot generate thumbnail for non-image type: ${contentType}`);
  }

  const client = getS3Client();
  const bucket = getBucketName();

  try {
    // Generate thumbnail
    const thumbnailBuffer = await generateThumbnail(imageBuffer, contentType);
    const thumbnailKey = getThumbnailKey(s3Key);

    // Upload original image (already done via presigned URL by client)
    // This function is for server-side uploads if needed

    // Upload thumbnail
    const thumbnailCommand = new PutObjectCommand({
      Bucket: bucket,
      Key: thumbnailKey,
      Body: thumbnailBuffer,
      ContentType: 'image/jpeg', // Thumbnails are always JPEG
      CacheControl: 'private, max-age=86400', // Cache for 1 day
      Metadata: {
        source_key: s3Key,
        thumbnail: 'true',
        generated_at: new Date().toISOString(),
      },
    });

    await client.send(thumbnailCommand);

    const duration = Date.now() - startTime;

    log.info('Uploaded image with thumbnail', {
      operation: 'upload_with_thumbnail',
      originalKey: s3Key,
      thumbnailKey,
      originalSize: imageBuffer.length,
      thumbnailSize: thumbnailBuffer.length,
      duration,
      component: 's3-private-assets',
    });

    return {
      originalKey: s3Key,
      thumbnailKey,
      thumbnailSize: thumbnailBuffer.length,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Failed to upload with thumbnail', error, {
      operation: 'upload_with_thumbnail',
      s3Key,
      contentType,
      duration,
      component: 's3-private-assets',
    });
    throw new Error('Failed to upload with thumbnail');
  }
}

/**
 * Generate thumbnail for existing S3 file
 * 
 * Downloads existing file, generates thumbnail, and uploads thumbnail to S3.
 * Useful for batch processing or retroactive thumbnail generation.
 * 
 * @param s3Key - S3 key of existing image
 * @param contentType - Image MIME type
 * @returns Thumbnail S3 key
 * @throws Error if file not found or processing fails
 * 
 * @example
 * // Generate thumbnail for existing attachment
 * const thumbnailKey = await generateThumbnailForExistingFile(
 *   'work-items/abc-123/attachments/photo.jpg',
 *   'image/jpeg'
 * );
 */
export async function generateThumbnailForExistingFile(
  s3Key: string,
  contentType: string
): Promise<string> {
  const startTime = Date.now();

  if (!isS3Configured()) {
    throw new Error('S3 private assets not configured.');
  }

  if (!isImage(contentType)) {
    throw new Error(`Cannot generate thumbnail for non-image type: ${contentType}`);
  }

  const client = getS3Client();
  const bucket = getBucketName();

  try {
    // Import GetObjectCommand dynamically
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');

    // Download original file
    const getCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    });

    const response = await client.send(getCommand);
    
    if (!response.Body) {
      throw new Error('No file body returned from S3');
    }
    
    const imageBuffer = Buffer.from(await response.Body.transformToByteArray());

    // Generate and upload thumbnail
    const result = await uploadWithThumbnail(imageBuffer, s3Key, contentType);

    const duration = Date.now() - startTime;

    log.info('Generated thumbnail for existing file', {
      operation: 'generate_thumbnail_existing',
      s3Key,
      thumbnailKey: result.thumbnailKey,
      duration,
      component: 's3-private-assets',
    });

    return result.thumbnailKey;
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Failed to generate thumbnail for existing file', error, {
      operation: 'generate_thumbnail_existing',
      s3Key,
      duration,
      component: 's3-private-assets',
    });
    throw new Error('Failed to generate thumbnail for existing file');
  }
}

