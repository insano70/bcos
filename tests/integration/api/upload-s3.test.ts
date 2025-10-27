/**
 * Integration tests for S3 Upload Flow
 * Tests the complete upload service with S3 integration (mocked)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/tests/setup/integration-setup';
import { uploadFiles } from '@/lib/api/services/upload';
import * as s3Service from '@/lib/s3/public-assets';

// Mock S3 service to avoid real AWS calls
vi.mock('@/lib/s3/public-assets', async () => {
  const actual = await vi.importActual<typeof s3Service>('@/lib/s3/public-assets');
  return {
    ...actual,
    isS3Configured: vi.fn(),
    uploadToS3: vi.fn(),
    deleteFromS3: vi.fn(),
    fileExistsInS3: vi.fn(),
  };
});

// Mock Sharp to avoid filesystem dependencies in tests
vi.mock('sharp', () => {
  const mockSharpInstance = {
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    png: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('optimized-image-data')),
    metadata: vi.fn().mockResolvedValue({ width: 1920, height: 1080, format: 'jpeg' }),
  };

  return {
    default: vi.fn(() => mockSharpInstance),
  };
});

describe('S3 Upload Integration', () => {
  // Helper to create mock File object
  function createMockFile(
    name: string,
    content: string,
    type: string,
    _size: number
  ): File {
    const blob = new Blob([content], { type });
    return new File([blob], name, { type }) as File & { size: number };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Upload with S3 Enabled', () => {
    it('should upload file to S3 when S3 is configured and path segments provided', async () => {
      // Mock S3 configured
      vi.mocked(s3Service.isS3Configured).mockReturnValue(true);
      vi.mocked(s3Service.uploadToS3).mockResolvedValue({
        fileUrl: 'https://cdn.bendcare.com/practices/123/logo/logo_abc123.jpg',
        s3Key: 'practices/123/logo/logo_abc123.jpg',
        size: 25000,
        contentType: 'image/jpeg',
      });

      // Create mock file
      const file = createMockFile(
        'logo.jpg',
        'fake-image-data',
        'image/jpeg',
        25000
      );

      // Upload with S3 path segments
      const result = await uploadFiles([file], {
        s3PathSegments: ['practices', '123', 'logo'],
        optimizeImages: true,
        generateThumbnails: false,
        allowedTypes: ['image/jpeg', 'image/png'],
        maxFileSize: 10 * 1024 * 1024,
        maxFiles: 5,
      });

      // Verify S3 upload was called
      expect(s3Service.uploadToS3).toHaveBeenCalledTimes(1);
      expect(s3Service.uploadToS3).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.stringMatching(/^practices\/123\/logo\/logo_[a-zA-Z0-9_-]+\.jpg$/),
        expect.objectContaining({
          contentType: 'image/jpeg',
        })
      );

      // Verify result
      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(1);
      expect(result.files[0]?.fileUrl).toContain('cdn.bendcare.com/practices/123/logo/logo_');
      expect(result.files[0]?.filePath).toMatch(/^practices\/123\/logo\/logo_[a-zA-Z0-9_-]+\.jpg$/);
      expect(result.files[0]?.mimeType).toBe('image/jpeg');
    });

    it('should upload multiple files to S3', async () => {
      vi.mocked(s3Service.isS3Configured).mockReturnValue(true);
      vi.mocked(s3Service.uploadToS3)
        .mockResolvedValueOnce({
          fileUrl: 'https://cdn.bendcare.com/practices/123/gallery/image1_abc.jpg',
          s3Key: 'practices/123/gallery/image1_abc.jpg',
          size: 30000,
          contentType: 'image/jpeg',
        })
        .mockResolvedValueOnce({
          fileUrl: 'https://cdn.bendcare.com/practices/123/gallery/image2_def.jpg',
          s3Key: 'practices/123/gallery/image2_def.jpg',
          size: 35000,
          contentType: 'image/jpeg',
        });

      const files = [
        createMockFile('image1.jpg', 'data1', 'image/jpeg', 30000),
        createMockFile('image2.jpg', 'data2', 'image/jpeg', 35000),
      ];

      const result = await uploadFiles(files, {
        s3PathSegments: ['practices', '123', 'gallery'],
        optimizeImages: true,
        generateThumbnails: false,
        allowedTypes: ['image/jpeg', 'image/png'],
        maxFileSize: 10 * 1024 * 1024,
        maxFiles: 5,
      });

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(2);
      expect(s3Service.uploadToS3).toHaveBeenCalledTimes(2);
      expect(result.files[0]?.fileUrl).toContain('cdn.bendcare.com');
      expect(result.files[1]?.fileUrl).toContain('cdn.bendcare.com');
    });

    it('should use correct S3 path segments for staff photos', async () => {
      vi.mocked(s3Service.isS3Configured).mockReturnValue(true);
      vi.mocked(s3Service.uploadToS3).mockResolvedValue({
        fileUrl: 'https://cdn.bendcare.com/practices/123/staff/456/photo_xyz.jpg',
        s3Key: 'practices/123/staff/456/photo_xyz.jpg',
        size: 28000,
        contentType: 'image/jpeg',
      });

      const file = createMockFile('headshot.jpg', 'photo-data', 'image/jpeg', 28000);

      const result = await uploadFiles([file], {
        s3PathSegments: ['practices', '123', 'staff', '456'],
        optimizeImages: true,
        generateThumbnails: false,
        allowedTypes: ['image/jpeg', 'image/png'],
        maxFileSize: 10 * 1024 * 1024,
        maxFiles: 1,
      });

      expect(result.success).toBe(true);
      expect(s3Service.uploadToS3).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.stringMatching(/^practices\/123\/staff\/456\/headshot_[a-zA-Z0-9_-]+\.jpg$/),
        expect.any(Object)
      );
      expect(result.files[0]?.fileUrl).toContain('practices/123/staff/456');
    });
  });

  describe('Upload with S3 Disabled (Fallback)', () => {
    it('should fall back to local filesystem when S3 not configured', async () => {
      // Mock S3 not configured
      vi.mocked(s3Service.isS3Configured).mockReturnValue(false);

      const file = createMockFile('logo.jpg', 'fake-data', 'image/jpeg', 25000);

      const result = await uploadFiles([file], {
        s3PathSegments: ['practices', '123', 'logo'], // Path segments provided but S3 disabled
        folder: 'test-uploads',
        optimizeImages: true,
        generateThumbnails: false,
        allowedTypes: ['image/jpeg', 'image/png'],
        maxFileSize: 10 * 1024 * 1024,
        maxFiles: 5,
      });

      // Verify S3 upload was NOT called
      expect(s3Service.uploadToS3).not.toHaveBeenCalled();

      // Verify result uses local path (uses folder parameter)
      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(1);
      expect(result.files[0]?.fileUrl).toContain('/test-uploads/');
      expect(result.files[0]?.filePath).toContain('/test-uploads/');
    });

    it('should fall back to local filesystem when no path segments provided', async () => {
      // Mock S3 configured but no path segments
      vi.mocked(s3Service.isS3Configured).mockReturnValue(true);

      const file = createMockFile('document.pdf', 'pdf-data', 'application/pdf', 50000);

      const result = await uploadFiles([file], {
        // No s3PathSegments provided
        folder: 'documents',
        optimizeImages: false,
        generateThumbnails: false,
        allowedTypes: ['application/pdf'],
        maxFileSize: 10 * 1024 * 1024,
        maxFiles: 5,
      });

      // Verify S3 upload was NOT called
      expect(s3Service.uploadToS3).not.toHaveBeenCalled();

      // Verify result uses local path (uses folder parameter)
      expect(result.success).toBe(true);
      expect(result.files[0]?.fileUrl).toContain('/documents/');
    });
  });

  describe('Thumbnail Generation with S3', () => {
    it('should generate thumbnails and upload to S3 with correct path', async () => {
      vi.mocked(s3Service.isS3Configured).mockReturnValue(true);

      // Mock main image upload
      vi.mocked(s3Service.uploadToS3)
        .mockResolvedValueOnce({
          fileUrl: 'https://cdn.bendcare.com/practices/123/hero/hero_abc.jpg',
          s3Key: 'practices/123/hero/hero_abc.jpg',
          size: 80000,
          contentType: 'image/jpeg',
        })
        // Mock thumbnail upload
        .mockResolvedValueOnce({
          fileUrl: 'https://cdn.bendcare.com/practices/123/hero/thumbnails/hero_abc.jpg',
          s3Key: 'practices/123/hero/thumbnails/hero_abc.jpg',
          size: 8000,
          contentType: 'image/jpeg',
        });

      const file = createMockFile('hero.jpg', 'hero-image', 'image/jpeg', 80000);

      const result = await uploadFiles([file], {
        s3PathSegments: ['practices', '123', 'hero'],
        optimizeImages: true,
        generateThumbnails: true,
        allowedTypes: ['image/jpeg', 'image/png'],
        maxFileSize: 10 * 1024 * 1024,
        maxFiles: 5,
      });

      // Verify both uploads called (main + thumbnail)
      expect(s3Service.uploadToS3).toHaveBeenCalledTimes(2);

      // Verify thumbnail path includes 'thumbnails' segment
      const thumbnailCall = vi.mocked(s3Service.uploadToS3).mock.calls[1];
      expect(thumbnailCall?.[1]).toMatch(/practices\/123\/hero\/thumbnails\//);

      // Verify result includes thumbnail URL
      expect(result.success).toBe(true);
      expect(result.files[0]?.thumbnail).toBe('https://cdn.bendcare.com/practices/123/hero/thumbnails/hero_abc.jpg');
    });

    it('should handle thumbnail generation failure gracefully', async () => {
      vi.mocked(s3Service.isS3Configured).mockReturnValue(true);

      // Main image succeeds
      vi.mocked(s3Service.uploadToS3)
        .mockResolvedValueOnce({
          fileUrl: 'https://cdn.bendcare.com/practices/123/logo/logo_abc.jpg',
          s3Key: 'practices/123/logo/logo_abc.jpg',
          size: 25000,
          contentType: 'image/jpeg',
        })
        // Thumbnail fails
        .mockRejectedValueOnce(new Error('Thumbnail upload failed'));

      const file = createMockFile('logo.jpg', 'logo-data', 'image/jpeg', 25000);

      const result = await uploadFiles([file], {
        s3PathSegments: ['practices', '123', 'logo'],
        optimizeImages: true,
        generateThumbnails: true,
        allowedTypes: ['image/jpeg', 'image/png'],
        maxFileSize: 10 * 1024 * 1024,
        maxFiles: 5,
      });

      // Main upload should still succeed
      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(1);
      expect(result.files[0]?.fileUrl).toContain('cdn.bendcare.com');

      // Thumbnail should be undefined
      expect(result.files[0]?.thumbnail).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle S3 upload failure', async () => {
      vi.mocked(s3Service.isS3Configured).mockReturnValue(true);
      vi.mocked(s3Service.uploadToS3).mockRejectedValue(
        new Error('S3 upload failed: Network error')
      );

      const file = createMockFile('logo.jpg', 'data', 'image/jpeg', 25000);

      const result = await uploadFiles([file], {
        s3PathSegments: ['practices', '123', 'logo'],
        optimizeImages: true,
        generateThumbnails: false,
        allowedTypes: ['image/jpeg'],
        maxFileSize: 10 * 1024 * 1024,
        maxFiles: 5,
      });

      // Upload should fail
      expect(result.success).toBe(false);
      expect(result.files).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('logo.jpg');
    });

    it('should reject files exceeding size limit', async () => {
      vi.mocked(s3Service.isS3Configured).mockReturnValue(true);

      // File is 15MB, limit is 10MB
      const largeFile = createMockFile(
        'large.jpg',
        'x'.repeat(15 * 1024 * 1024),
        'image/jpeg',
        15 * 1024 * 1024
      );

      const result = await uploadFiles([largeFile], {
        s3PathSegments: ['practices', '123', 'logo'],
        optimizeImages: true,
        generateThumbnails: false,
        allowedTypes: ['image/jpeg'],
        maxFileSize: 10 * 1024 * 1024,
        maxFiles: 5,
      });

      // Should reject file
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('exceeds maximum size');
      expect(s3Service.uploadToS3).not.toHaveBeenCalled();
    });

    it('should reject invalid file types', async () => {
      vi.mocked(s3Service.isS3Configured).mockReturnValue(true);

      const invalidFile = createMockFile(
        'malware.exe',
        'executable-data',
        'application/x-msdownload',
        10000
      );

      const result = await uploadFiles([invalidFile], {
        s3PathSegments: ['practices', '123', 'files'],
        optimizeImages: false,
        generateThumbnails: false,
        allowedTypes: ['image/jpeg', 'image/png'],
        maxFileSize: 10 * 1024 * 1024,
        maxFiles: 5,
      });

      // Should reject file
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('not allowed');
      expect(s3Service.uploadToS3).not.toHaveBeenCalled();
    });

    it('should reject when exceeding max files limit', async () => {
      vi.mocked(s3Service.isS3Configured).mockReturnValue(true);

      const files = [
        createMockFile('file1.jpg', 'data', 'image/jpeg', 1000),
        createMockFile('file2.jpg', 'data', 'image/jpeg', 1000),
        createMockFile('file3.jpg', 'data', 'image/jpeg', 1000),
        createMockFile('file4.jpg', 'data', 'image/jpeg', 1000),
      ];

      const result = await uploadFiles(files, {
        s3PathSegments: ['practices', '123', 'gallery'],
        optimizeImages: false,
        generateThumbnails: false,
        allowedTypes: ['image/jpeg'],
        maxFileSize: 10 * 1024 * 1024,
        maxFiles: 3, // Limit to 3 files
      });

      // Should reject
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Maximum');
      expect(s3Service.uploadToS3).not.toHaveBeenCalled();
    });
  });

  describe('Practice Image Upload Flow', () => {
    it('should upload practice logo to correct S3 path', async () => {
      vi.mocked(s3Service.isS3Configured).mockReturnValue(true);
      vi.mocked(s3Service.uploadToS3).mockResolvedValue({
        fileUrl: 'https://cdn.bendcare.com/practices/practice-123/logo/logo_unique.jpg',
        s3Key: 'practices/practice-123/logo/logo_unique.jpg',
        size: 32000,
        contentType: 'image/jpeg',
      });

      const logoFile = createMockFile('company-logo.jpg', 'logo', 'image/jpeg', 32000);

      const result = await uploadFiles([logoFile], {
        s3PathSegments: ['practices', 'practice-123', 'logo'],
        optimizeImages: true,
        generateThumbnails: true,
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maxFileSize: 10 * 1024 * 1024,
        maxFiles: 1,
      });

      expect(result.success).toBe(true);
      expect(result.files[0]?.fileUrl).toMatch(/practices\/practice-123\/logo/);
      expect(s3Service.uploadToS3).toHaveBeenCalled();
    });

    it('should upload practice hero image to correct S3 path', async () => {
      vi.mocked(s3Service.isS3Configured).mockReturnValue(true);
      vi.mocked(s3Service.uploadToS3).mockResolvedValue({
        fileUrl: 'https://cdn.bendcare.com/practices/practice-456/hero/hero_unique.jpg',
        s3Key: 'practices/practice-456/hero/hero_unique.jpg',
        size: 120000,
        contentType: 'image/jpeg',
      });

      const heroFile = createMockFile('hero-banner.jpg', 'banner', 'image/jpeg', 120000);

      const result = await uploadFiles([heroFile], {
        s3PathSegments: ['practices', 'practice-456', 'hero'],
        optimizeImages: true,
        generateThumbnails: false,
        allowedTypes: ['image/jpeg', 'image/png'],
        maxFileSize: 10 * 1024 * 1024,
        maxFiles: 1,
      });

      expect(result.success).toBe(true);
      expect(result.files[0]?.fileUrl).toMatch(/practices\/practice-456\/hero/);
    });

    it('should upload practice gallery images to correct S3 path', async () => {
      vi.mocked(s3Service.isS3Configured).mockReturnValue(true);
      vi.mocked(s3Service.uploadToS3)
        // First file main upload
        .mockResolvedValueOnce({
          fileUrl: 'https://cdn.bendcare.com/practices/practice-789/gallery/image1.jpg',
          s3Key: 'practices/practice-789/gallery/image1.jpg',
          size: 45000,
          contentType: 'image/jpeg',
        })
        // First file thumbnail
        .mockResolvedValueOnce({
          fileUrl: 'https://cdn.bendcare.com/practices/practice-789/gallery/thumbnails/image1.jpg',
          s3Key: 'practices/practice-789/gallery/thumbnails/image1.jpg',
          size: 8000,
          contentType: 'image/jpeg',
        })
        // Second file main upload
        .mockResolvedValueOnce({
          fileUrl: 'https://cdn.bendcare.com/practices/practice-789/gallery/image2.jpg',
          s3Key: 'practices/practice-789/gallery/image2.jpg',
          size: 48000,
          contentType: 'image/jpeg',
        })
        // Second file thumbnail
        .mockResolvedValueOnce({
          fileUrl: 'https://cdn.bendcare.com/practices/practice-789/gallery/thumbnails/image2.jpg',
          s3Key: 'practices/practice-789/gallery/thumbnails/image2.jpg',
          size: 9000,
          contentType: 'image/jpeg',
        });

      const galleryFiles = [
        createMockFile('office1.jpg', 'office', 'image/jpeg', 45000),
        createMockFile('office2.jpg', 'office', 'image/jpeg', 48000),
      ];

      const result = await uploadFiles(galleryFiles, {
        s3PathSegments: ['practices', 'practice-789', 'gallery'],
        optimizeImages: true,
        generateThumbnails: true,
        allowedTypes: ['image/jpeg', 'image/png'],
        maxFileSize: 10 * 1024 * 1024,
        maxFiles: 10,
      });

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(2);
      expect(result.files[0]?.fileUrl).toMatch(/practices\/practice-789\/gallery/);
      expect(result.files[1]?.fileUrl).toMatch(/practices\/practice-789\/gallery/);
    });
  });

  describe('Staff Photo Upload Flow', () => {
    it('should upload staff photo to correct S3 path with staff ID', async () => {
      vi.mocked(s3Service.isS3Configured).mockReturnValue(true);
      vi.mocked(s3Service.uploadToS3).mockResolvedValue({
        fileUrl: 'https://cdn.bendcare.com/practices/practice-123/staff/staff-456/photo.jpg',
        s3Key: 'practices/practice-123/staff/staff-456/photo.jpg',
        size: 35000,
        contentType: 'image/jpeg',
      });

      const staffPhoto = createMockFile('headshot.jpg', 'photo', 'image/jpeg', 35000);

      const result = await uploadFiles([staffPhoto], {
        s3PathSegments: ['practices', 'practice-123', 'staff', 'staff-456'],
        optimizeImages: true,
        generateThumbnails: true,
        allowedTypes: ['image/jpeg', 'image/png'],
        maxFileSize: 10 * 1024 * 1024,
        maxFiles: 1,
      });

      expect(result.success).toBe(true);
      expect(result.files[0]?.fileUrl).toMatch(/practices\/practice-123\/staff\/staff-456/);
      expect(s3Service.uploadToS3).toHaveBeenCalled();
    });

    it('should upload staff photo without staff ID to generic staff folder', async () => {
      vi.mocked(s3Service.isS3Configured).mockReturnValue(true);
      vi.mocked(s3Service.uploadToS3).mockResolvedValue({
        fileUrl: 'https://cdn.bendcare.com/practices/practice-999/staff/photo.jpg',
        s3Key: 'practices/practice-999/staff/photo.jpg',
        size: 28000,
        contentType: 'image/jpeg',
      });

      const staffPhoto = createMockFile('provider.jpg', 'photo', 'image/jpeg', 28000);

      const result = await uploadFiles([staffPhoto], {
        s3PathSegments: ['practices', 'practice-999', 'staff'],
        optimizeImages: true,
        generateThumbnails: false,
        allowedTypes: ['image/jpeg', 'image/png'],
        maxFileSize: 10 * 1024 * 1024,
        maxFiles: 1,
      });

      expect(result.success).toBe(true);
      expect(result.files[0]?.fileUrl).toMatch(/practices\/practice-999\/staff/);
      expect(result.files[0]?.fileUrl).not.toMatch(/staff\/staff-/); // No specific staff ID
    });
  });
});
