import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import sharp from 'sharp';
import { log } from '@/lib/logger';

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
export const DEFAULT_UPLOAD_OPTIONS: Required<UploadOptions> = {
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
};

/**
 * Supported image MIME types
 */
export const IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
];

/**
 * Upload multiple files with validation and processing
 */
export async function uploadFiles(files: File[], options: UploadOptions = {}): Promise<UploadResult> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_UPLOAD_OPTIONS, ...options };
  const result: UploadResult = {
    success: true,
    files: [],
    errors: [],
  };

  // Enhanced upload operation logging - permanently enabled
  log.info('File upload operation initiated', {
    fileCount: files.length,
    maxAllowed: opts.maxFiles,
    allowedTypes: opts.allowedTypes,
    optimizeImages: opts.optimizeImages,
    generateThumbnails: opts.generateThumbnails,
    targetFolder: opts.folder,
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
      const fileResult = await processFile(file, opts);
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
      storageLocation: 'local_filesystem',
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
 */
export async function deleteFile(filePath: string): Promise<boolean> {
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

    return true;
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

/**
 * Process a single file with validation and optimization
 * @internal
 */
async function processFile(
  file: File,
  options: Required<UploadOptions>
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

  // Generate unique filename
  const fileExtension = path.extname(file.name);
  const baseName = path.basename(file.name, fileExtension);
  const uniqueId = nanoid(8);
  const fileName = `${sanitizeFilename(baseName)}_${uniqueId}${fileExtension}`;
  const filePath = path.join(process.cwd(), 'public', options.folder, fileName);
  const fileUrl = `/${options.folder}/${fileName}`;

  // Convert File to Buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let processedBuffer = buffer;
  let thumbnail: string | undefined;

  // Process images
  if (IMAGE_TYPES.includes(file.type)) {
    if (options.optimizeImages) {
      const optimized = await optimizeImage(buffer, file.type);
      processedBuffer = Buffer.from(optimized);
    }

    if (options.generateThumbnails) {
      thumbnail = await generateThumbnail(buffer, fileName, options.folder);
    }
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
