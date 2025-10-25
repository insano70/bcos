/**
 * Unit tests for S3 Image Processing
 */

import { describe, expect, it } from 'vitest';
import {
  getThumbnailKey,
  isImage,
} from '@/lib/s3/private-assets';

describe('S3 Image Processing', () => {
  describe('isImage', () => {
    it('should return true for JPEG images', () => {
      expect(isImage('image/jpeg')).toBe(true);
    });

    it('should return true for PNG images', () => {
      expect(isImage('image/png')).toBe(true);
    });

    it('should return true for GIF images', () => {
      expect(isImage('image/gif')).toBe(true);
    });

    it('should return true for WebP images', () => {
      expect(isImage('image/webp')).toBe(true);
    });

    it('should return true for BMP images', () => {
      expect(isImage('image/bmp')).toBe(true);
    });

    it('should return false for PDF documents', () => {
      expect(isImage('application/pdf')).toBe(false);
    });

    it('should return false for Word documents', () => {
      expect(isImage('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(false);
    });

    it('should return false for text files', () => {
      expect(isImage('text/plain')).toBe(false);
    });

    it('should return false for SVG (not in IMAGE_MIME_TYPES)', () => {
      expect(isImage('image/svg+xml')).toBe(false);
    });

    it('should return false for unknown MIME types', () => {
      expect(isImage('application/octet-stream')).toBe(false);
    });
  });

  describe('getThumbnailKey', () => {
    it('should generate thumbnail key for work item attachment', () => {
      const originalKey = 'work-items/abc-123/attachments/photo_xyz.jpg';
      const thumbnailKey = getThumbnailKey(originalKey);
      
      expect(thumbnailKey).toBe('work-items/abc-123/attachments/thumbnails/photo_xyz_thumb.jpg');
    });

    it('should generate thumbnail key for user document', () => {
      const originalKey = 'users/user-456/documents/image.png';
      const thumbnailKey = getThumbnailKey(originalKey);
      
      expect(thumbnailKey).toBe('users/user-456/documents/thumbnails/image_thumb.jpg');
    });

    it('should handle simple filename without path', () => {
      const originalKey = 'photo.jpg';
      const thumbnailKey = getThumbnailKey(originalKey);
      
      expect(thumbnailKey).toBe('thumbnails/photo_thumb.jpg');
    });

    it('should handle complex filenames with underscores', () => {
      const originalKey = 'work-items/abc/attachments/complex_file_name_xyz123.jpeg';
      const thumbnailKey = getThumbnailKey(originalKey);
      
      expect(thumbnailKey).toBe('work-items/abc/attachments/thumbnails/complex_file_name_xyz123_thumb.jpg');
    });

    it('should always use .jpg extension for thumbnails', () => {
      const originalKey = 'work-items/abc/attachments/image.png';
      const thumbnailKey = getThumbnailKey(originalKey);
      
      expect(thumbnailKey).toMatch(/\.jpg$/);
      expect(thumbnailKey).not.toMatch(/\.png$/);
    });

    it('should handle nested directory structures', () => {
      const originalKey = 'work-items/parent/children/child-123/attachments/photo.webp';
      const thumbnailKey = getThumbnailKey(originalKey);
      
      expect(thumbnailKey).toBe('work-items/parent/children/child-123/attachments/thumbnails/photo_thumb.jpg');
    });

    it('should handle files with multiple dots in name', () => {
      const originalKey = 'work-items/abc/attachments/file.backup.jpg';
      const thumbnailKey = getThumbnailKey(originalKey);
      
      expect(thumbnailKey).toBe('work-items/abc/attachments/thumbnails/file.backup_thumb.jpg');
    });
  });

  describe('Thumbnail Generation (Integration with sharp)', () => {
    it('should have sharp library available', async () => {
      // Verify sharp is installed and can be imported
      const sharp = await import('sharp');
      expect(sharp).toBeDefined();
      expect(sharp.default).toBeDefined();
    });
  });
});

