import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import sharp from 'sharp';
import { log } from '@/lib/logger';
import {
  deleteFromS3,
  generateS3Key,
  getPublicUrl,
  isCloudFrontUrl,
  isS3Configured,
  uploadToS3,
} from '@/lib/s3/public-assets';

/**
 * Enterprise File Upload Service (Pure Functions Module)
 * Handles secure file uploads with validation, optimization, and storage
 * Requires Node.js runtime (filesystem and Sharp dependencies)
 */

interface UploadOptions {
  allowedTypes?: string[];
  maxFileSize?: number; // in bytes
  maxFiles?: number;
  optimizeImages?: boolean;
  generateThumbnails?: boolean;
  folder?: string;
  /**
   * S3 path segments for building S3 keys
   * If provided and S3 is configured, files will be uploaded to S3 instead of local filesystem
   * @example ['practices', '123', 'logo'] => 'practices/123/logo/filename.jpg'
   * @example ['users', 'user-uuid', 'avatar'] => 'users/user-uuid/avatar/photo.png'
   */
  s3PathSegments?: string[];
}

interface ProcessedFile {
  originalName: string;
  fileName: string;
  filePath: string;
  fileUrl: string;
  mimeType: string;
  size: number;
  thumbnail?: string;
}

interface UploadResult {
  success: boolean;
  files: ProcessedFile[];
  errors: string[];
}

/**
 * Default upload configuration
 */
export const DEFAULT_UPLOAD_OPTIONS: Required<Omit<UploadOptions, 's3PathSegments'>> & {
  s3PathSegments: undefined;
} = {
  allowedTypes: [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 10,
  optimizeImages: true,
  generateThumbnails: true,
  folder: 'uploads',
  s3PathSegments: undefined,
};

/**
 * Supported image MIME types
 */
export const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Upload multiple files with validation and processing
 */
export async function uploadFiles(
  files: File[],
  options: UploadOptions = {}
): Promise<UploadResult> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_UPLOAD_OPTIONS, ...options };
  const result: UploadResult = {
    success: true,
    files: [],
    errors: [],
  };

  // Detect S3 usage
  const useS3 = isS3Configured() && opts.s3PathSegments && opts.s3PathSegments.length > 0;

  // Enhanced upload operation logging - permanently enabled
  log.info('File upload operation initiated', {
    fileCount: files.length,
    maxAllowed: opts.maxFiles,
    allowedTypes: opts.allowedTypes,
    optimizeImages: opts.optimizeImages,
    generateThumbnails: opts.generateThumbnails,
    targetFolder: opts.folder,
    storageType: useS3 ? 's3' : 'local',
    s3PathSegments: useS3 ? opts.s3PathSegments : undefined,
  });

  // Security validation logging
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  log.security('file_upload_security_check', 'low', {
    action: 'upload_validation',
    fileCount: files.length,
    totalSize,
    maxFileSize: opts.maxFileSize,
    securityValidation: 'initiated',
  });

  // Validate file count
  if (files.length > opts.maxFiles) {
    // Enhanced logging permanently enabled
    log.security('file_upload_violation', 'medium', {
      action: 'file_count_exceeded',
      threat: 'resource_abuse',
      blocked: true,
      attemptedCount: files.length,
      allowedCount: opts.maxFiles,
    });

    result.errors.push(`Maximum ${opts.maxFiles} files allowed`);
    result.success = false;
    return result;
  }

  // Ensure upload directory exists
  const uploadDir = path.join(process.cwd(), 'public', opts.folder);
  if (!existsSync(uploadDir)) {
    await mkdir(uploadDir, { recursive: true });
  }

  // Process each file
  for (const file of files) {
    try {
      const fileResult = await processFile(file, opts as ProcessFileOptions);
      if (fileResult.success && fileResult.file) {
        result.files.push(fileResult.file);
      } else {
        result.errors.push(...fileResult.errors);
        result.success = false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Failed to process ${file.name}: ${errorMessage}`);
      result.success = false;
    }
  }

  // Enhanced upload completion logging - permanently enabled
  const duration = Date.now() - startTime;

  // Business intelligence for upload analytics
  log.info('File upload analytics', {
    totalFiles: files.length,
    successfulFiles: result.files.length,
    failedFiles: result.errors.length,
    successRate: result.files.length / files.length,
    totalProcessingTime: duration,
    averageProcessingTime: duration / files.length,
    optimizationEnabled: opts.optimizeImages,
    thumbnailsGenerated: opts.generateThumbnails,
  });

  // Security completion logging
  if (result.success) {
    log.security('file_upload_completed', 'low', {
      action: 'upload_successful',
      filesProcessed: result.files.length,
      securityValidation: 'passed',
      storageLocation: useS3 ? 's3_cloudfront' : 'local_filesystem',
    });
  } else {
    log.security('file_upload_failed', 'medium', {
      action: 'upload_failed',
      reason: 'validation_errors',
      errorCount: result.errors.length,
      partialSuccess: result.files.length > 0,
    });
  }

  // Performance monitoring
  log.timing('Upload operation completed', startTime, {
    fileCount: files.length,
    successCount: result.files.length,
    errorCount: result.errors.length,
  });

  return result;
}

/**
 * Upload a single file
 */
export async function uploadFile(file: File, options: UploadOptions = {}): Promise<UploadResult> {
  return uploadFiles([file], options);
}

/**
 * Delete uploaded file and its thumbnail
 * Supports both S3 (CloudFront URLs or S3 keys) and local filesystem paths
 */
export async function deleteFile(filePath: string): Promise<boolean> {
  try {
    // Detect if this is an S3 file (CloudFront URL or S3-like key)
    const isS3File = isCloudFrontUrl(filePath) || (!filePath.startsWith('/') && filePath.includes('/'));

    if (isS3File && isS3Configured()) {
      // S3 deletion path
      return await deleteFileS3(filePath);
    }

    // Local filesystem deletion path
    return await deleteFileLocal(filePath);
  } catch (error) {
    log.error('File deletion failed', error instanceof Error ? error : new Error(String(error)), {
      filePath,
      component: 'file-management',
      feature: 'secure-uploads',
      stack: error instanceof Error ? error.stack : undefined,
      operation: 'deleteFile',
    });
    return false;
  }
}

/**
 * Delete file from S3
 * @internal
 */
async function deleteFileS3(filePathOrUrl: string): Promise<boolean> {
  try {
    // Extract S3 key from CloudFront URL if needed
    const s3Key = isCloudFrontUrl(filePathOrUrl)
      ? (getPublicUrl(filePathOrUrl).split('/').slice(3).join('/') || filePathOrUrl)
      : filePathOrUrl;

    // Delete main file
    await deleteFromS3(s3Key);

    log.info('File deleted from S3', {
      s3Key,
      component: 'upload-service',
    });

    // Delete thumbnail if exists
    // Thumbnail pattern: replace last path segment folder with 'thumbnails'
    const pathParts = s3Key.split('/');
    const fileName = pathParts.pop();
    if (fileName) {
      const thumbnailKey = [...pathParts, 'thumbnails', fileName].join('/');
      try {
        await deleteFromS3(thumbnailKey);
        log.info('Thumbnail deleted from S3', {
          s3Key: thumbnailKey,
          component: 'upload-service',
        });
      } catch (_error) {
        // Thumbnail might not exist, which is fine
        log.info('Thumbnail not found in S3 (expected if no thumbnail was generated)', {
          s3Key: thumbnailKey,
          component: 'upload-service',
        });
      }
    }

    return true;
  } catch (error) {
    log.error('S3 file deletion failed', error instanceof Error ? error : new Error(String(error)), {
      filePathOrUrl,
      component: 'upload-service',
    });
    return false;
  }
}

/**
 * Delete file from local filesystem
 * @internal
 */
async function deleteFileLocal(filePath: string): Promise<boolean> {
  try {
    const fs = await import('node:fs/promises');
    const fullPath = path.join(process.cwd(), 'public', filePath);

    // Delete main file
    if (existsSync(fullPath)) {
      await fs.unlink(fullPath);
    }

    // Delete thumbnail if exists
    const fileName = path.basename(filePath);
    const folder = path.dirname(filePath);
    const thumbnailPath = path.join(
      process.cwd(),
      'public',
      folder,
      'thumbnails',
      `thumb_${fileName}`
    );

    if (existsSync(thumbnailPath)) {
      await fs.unlink(thumbnailPath);
    }

    log.info('File deleted from local filesystem', {
      filePath,
      component: 'upload-service',
    });

    return true;
  } catch (error) {
    log.error('Local file deletion failed', error instanceof Error ? error : new Error(String(error)), {
      filePath,
      component: 'upload-service',
    });
    return false;
  }
}

/**
 * Get file information
 */
export async function getFileInfo(filePath: string) {
  try {
    const fs = await import('node:fs/promises');
    const fullPath = path.join(process.cwd(), 'public', filePath);
    const stats = await fs.stat(fullPath);

    return {
      exists: true,
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      isFile: stats.isFile(),
    };
  } catch (error) {
    return {
      exists: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

type ProcessFileOptions = Required<Omit<UploadOptions, 's3PathSegments'>> & {
  s3PathSegments?: string[];
};

/**
 * Process a single file with validation and optimization
 * Supports both S3 and local filesystem storage with automatic detection
 * @internal
 */
async function processFile(
  file: File,
  options: ProcessFileOptions
): Promise<{ success: boolean; file?: ProcessedFile; errors: string[] }> {
  const errors: string[] = [];

  // Validate file type
  if (!options.allowedTypes.includes(file.type)) {
    errors.push(`File type ${file.type} not allowed for ${file.name}`);
    return { success: false, errors };
  }

  // Validate file size
  if (file.size > options.maxFileSize) {
    const maxSizeMB = options.maxFileSize / (1024 * 1024);
    errors.push(`File ${file.name} exceeds maximum size of ${maxSizeMB}MB`);
    return { success: false, errors };
  }

  // Detect S3 usage
  const useS3 = isS3Configured() && options.s3PathSegments && options.s3PathSegments.length > 0;

  // Convert File to Buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let processedBuffer = buffer;

  // Process images (optimization)
  if (IMAGE_TYPES.includes(file.type) && options.optimizeImages) {
    const optimized = await optimizeImage(buffer, file.type);
    processedBuffer = Buffer.from(optimized);
  }

  // Branch: S3 upload or local filesystem
  if (useS3) {
    return await processFileS3(file, processedBuffer, options);
  }

  return await processFileLocal(file, processedBuffer, options);
}

/**
 * Process file for S3 storage
 * @internal
 */
async function processFileS3(
  file: File,
  processedBuffer: Buffer,
  options: ProcessFileOptions
): Promise<{ success: boolean; file?: ProcessedFile; errors: string[] }> {
  const errors: string[] = [];

  try {
    // Generate S3 key
    const s3Key = generateS3Key(options.s3PathSegments || [], file.name);

    // Upload to S3
    const uploadResult = await uploadToS3(processedBuffer, s3Key, {
      contentType: file.type,
    });

    log.info('File uploaded to S3', {
      originalName: file.name,
      s3Key: uploadResult.s3Key,
      fileUrl: uploadResult.fileUrl,
      size: uploadResult.size,
      component: 'upload-service',
    });

    // Generate thumbnail if needed
    let thumbnail: string | undefined;
    if (IMAGE_TYPES.includes(file.type) && options.generateThumbnails) {
      thumbnail = await generateThumbnailS3(
        processedBuffer,
        file.name,
        options.s3PathSegments || []
      );
    }

    const processedFile: ProcessedFile = {
      originalName: file.name,
      fileName: path.basename(s3Key),
      filePath: s3Key, // Store S3 key in filePath for reference
      fileUrl: uploadResult.fileUrl,
      mimeType: file.type,
      size: uploadResult.size,
      ...(thumbnail && { thumbnail }),
    };

    return {
      success: true,
      file: processedFile,
      errors: [],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown S3 upload error';
    log.error('S3 file upload failed', error instanceof Error ? error : new Error(errorMessage), {
      fileName: file.name,
      component: 'upload-service',
    });
    errors.push(`Failed to upload ${file.name} to S3: ${errorMessage}`);
    return { success: false, errors };
  }
}

/**
 * Process file for local filesystem storage
 * @internal
 */
async function processFileLocal(
  file: File,
  processedBuffer: Buffer,
  options: ProcessFileOptions
): Promise<{ success: boolean; file?: ProcessedFile; errors: string[] }> {
  const errors: string[] = [];

  // Generate unique filename
  const fileExtension = path.extname(file.name);
  const baseName = path.basename(file.name, fileExtension);
  const uniqueId = nanoid(8);
  const fileName = `${sanitizeFilename(baseName)}_${uniqueId}${fileExtension}`;
  const filePath = path.join(process.cwd(), 'public', options.folder, fileName);
  const fileUrl = `/${options.folder}/${fileName}`;

  let thumbnail: string | undefined;

  // Generate thumbnail if needed
  if (IMAGE_TYPES.includes(file.type) && options.generateThumbnails) {
    thumbnail = await generateThumbnail(processedBuffer, fileName, options.folder);
  }

  // Save file
  await writeFile(filePath, processedBuffer);

  // Verify file was saved
  if (!existsSync(filePath)) {
    errors.push(`Failed to save file ${file.name}`);
    return { success: false, errors };
  }

  const processedFile: ProcessedFile = {
    originalName: file.name,
    fileName,
    filePath,
    fileUrl,
    mimeType: file.type,
    size: processedBuffer.length,
    ...(thumbnail && { thumbnail }),
  };

  return {
    success: true,
    file: processedFile,
    errors: [],
  };
}

/**
 * Optimize images for web delivery
 * @internal
 */
async function optimizeImage(buffer: Buffer, mimeType: string): Promise<Buffer> {
  try {
    let sharpInstance = sharp(buffer);

    // Get image metadata
    const metadata = await sharpInstance.metadata();

    // Resize large images
    if (metadata.width && metadata.width > 2000) {
      sharpInstance = sharpInstance.resize(2000, null, {
        withoutEnlargement: true,
        fit: 'inside',
      });
    }

    // Convert to appropriate format and optimize
    switch (mimeType) {
      case 'image/jpeg':
      case 'image/jpg':
        return await sharpInstance.jpeg({ quality: 85, progressive: true }).toBuffer();

      case 'image/png':
        return await sharpInstance.png({ compressionLevel: 8, progressive: true }).toBuffer();

      case 'image/webp':
        return await sharpInstance.webp({ quality: 85 }).toBuffer();

      default:
        return buffer;
    }
  } catch (error) {
    log.warn('Image optimization failed, using original', {
      error: error instanceof Error ? error.message : 'Unknown error',
      operation: 'optimizeImage',
      component: 'file-management',
      feature: 'secure-uploads',
    });
    return buffer;
  }
}

/**
 * Generate thumbnail for images
 * @internal
 */
async function generateThumbnail(
  buffer: Buffer,
  originalFileName: string,
  folder: string
): Promise<string> {
  try {
    const thumbnailName = `thumb_${originalFileName}`;
    const thumbnailPath = path.join(process.cwd(), 'public', folder, 'thumbnails');
    const thumbnailFile = path.join(thumbnailPath, thumbnailName);
    const thumbnailUrl = `/${folder}/thumbnails/${thumbnailName}`;

    // Ensure thumbnails directory exists
    if (!existsSync(thumbnailPath)) {
      await mkdir(thumbnailPath, { recursive: true });
    }

    // Generate thumbnail
    const thumbnailBuffer = await sharp(buffer)
      .resize(300, 300, {
        fit: 'cover',
        position: 'center',
      })
      .jpeg({ quality: 80 })
      .toBuffer();

    await writeFile(thumbnailFile, thumbnailBuffer);
    return thumbnailUrl;
  } catch (error) {
    log.warn('Thumbnail generation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      operation: 'generateThumbnail',
      component: 'file-management',
      feature: 'secure-uploads',
    });
    return '';
  }
}

/**
 * Generate thumbnail for images and upload to S3
 * @internal
 */
async function generateThumbnailS3(
  buffer: Buffer,
  originalFileName: string,
  pathSegments: string[]
): Promise<string> {
  try {
    // Generate thumbnail buffer
    const thumbnailBuffer = await sharp(buffer)
      .resize(300, 300, {
        fit: 'cover',
        position: 'center',
      })
      .jpeg({ quality: 80 })
      .toBuffer();

    // Create thumbnail path segments: [...pathSegments, 'thumbnails']
    const thumbnailPathSegments = [...pathSegments, 'thumbnails'];

    // Generate S3 key for thumbnail
    const thumbnailS3Key = generateS3Key(thumbnailPathSegments, originalFileName);

    // Upload thumbnail to S3
    const thumbnailResult = await uploadToS3(thumbnailBuffer, thumbnailS3Key, {
      contentType: 'image/jpeg',
    });

    log.info('Thumbnail uploaded to S3', {
      s3Key: thumbnailResult.s3Key,
      fileUrl: thumbnailResult.fileUrl,
      size: thumbnailResult.size,
      component: 'upload-service',
    });

    return thumbnailResult.fileUrl;
  } catch (error) {
    log.warn('S3 thumbnail generation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      operation: 'generateThumbnailS3',
      component: 'upload-service',
    });
    return '';
  }
}

/**
 * Sanitize filename for safe storage
 * @internal
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace special chars with underscore
    .replace(/_{2,}/g, '_') // Replace multiple underscores with single
    .replace(/^_|_$/g, '') // Remove leading/trailing underscores
    .toLowerCase()
    .substring(0, 50); // Limit length
}
