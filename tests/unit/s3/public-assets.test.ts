/**
 * Unit tests for S3 Public Assets Service
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Default mock config that can be modified per test
const defaultMockConfig = {
  region: 'us-east-1',
  accessKeyId: 'AKIATEST',
  secretAccessKey: 'secrettest',
  bucket: 'test-bucket',
  cdnUrl: 'https://cdn.bendcare.com',
};

// Create mutable config that tests can modify
let mockConfig = { ...defaultMockConfig };
let mockS3Enabled = true;

// Mock the env module before importing S3 service
vi.mock('@/lib/env', () => ({
  getPublicS3Config: vi.fn(() => ({ ...mockConfig })),
  isPublicS3Enabled: vi.fn(() => mockS3Enabled),
  env: {
    S3_PUBLIC_REGION: 'us-east-1',
    S3_PUBLIC_ACCESS_KEY_ID: 'AKIATEST',
    S3_PUBLIC_SECRET_ACCESS_KEY: 'secrettest',
    S3_PUBLIC_BUCKET: 'test-bucket',
    CDN_URL: 'https://cdn.bendcare.com',
  },
}));

import { getPublicS3Config, isPublicS3Enabled } from '@/lib/env';
import {
  extractS3Key,
  generateS3Key,
  getBucketName,
  getCdnUrl,
  getPublicUrl,
  isCloudFrontUrl,
  isLocalUrl,
  isS3Configured,
} from '@/lib/s3/public-assets';

describe('S3 Public Assets Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock config to defaults
    mockConfig = { ...defaultMockConfig };
    mockS3Enabled = true;
    vi.mocked(getPublicS3Config).mockImplementation(() => ({ ...mockConfig }));
    vi.mocked(isPublicS3Enabled).mockImplementation(() => mockS3Enabled);
  });

  describe('generateS3Key', () => {
    it('should generate key with default options (unique ID)', () => {
      const key = generateS3Key(['practices', '123', 'logo'], 'company-logo.jpg');

      // Should match pattern: practices/123/logo/company-logo_{uniqueId}.jpg
      expect(key).toMatch(/^practices\/123\/logo\/company-logo_[a-zA-Z0-9_-]{10}\.jpg$/);
    });

    it('should generate key without unique ID when disabled', () => {
      const key = generateS3Key(['practices', '123', 'logo'], 'logo.jpg', {
        addUniqueId: false,
      });

      expect(key).toBe('practices/123/logo/logo.jpg');
    });

    it('should generate key with timestamp when enabled', () => {
      const key = generateS3Key(['docs', 'reports'], 'report.pdf', {
        addTimestamp: true,
        addUniqueId: false,
      });

      // Should match pattern: docs/reports/report_{timestamp}.pdf
      expect(key).toMatch(/^docs\/reports\/report_\d{13}\.pdf$/);
    });

    it('should generate key with both timestamp and unique ID', () => {
      const key = generateS3Key(['uploads', 'temp'], 'file.txt', {
        addTimestamp: true,
        addUniqueId: true,
      });

      // Should match pattern: uploads/temp/file_{timestamp}_{uniqueId}.txt
      expect(key).toMatch(/^uploads\/temp\/file_\d{13}_[a-zA-Z0-9_-]{10}\.txt$/);
    });

    it('should generate key with custom unique ID length', () => {
      const key = generateS3Key(['test'], 'file.jpg', {
        uniqueIdLength: 20,
      });

      expect(key).toMatch(/^test\/file_[a-zA-Z0-9_-]{20}\.jpg$/);
    });

    it('should handle multiple path segments', () => {
      const key = generateS3Key(
        ['practices', '123', 'staff', '456', 'photos'],
        'headshot.jpg',
        { addUniqueId: false }
      );

      expect(key).toBe('practices/123/staff/456/photos/headshot.jpg');
    });

    it('should sanitize filename with special characters', () => {
      const key = generateS3Key(['test'], 'My File Name (1).jpg', {
        addUniqueId: false,
      });

      // Parentheses and spaces are replaced with underscores, then collapsed
      expect(key).toBe('test/my_file_name_1.jpg');
    });

    it('should sanitize path segments with special characters', () => {
      const key = generateS3Key(['my-folder', 'sub folder', 'test@123'], 'file.txt', {
        addUniqueId: false,
      });

      expect(key).toBe('my-folder/sub-folder/test-123/file.txt');
    });

    it('should preserve file extension in lowercase', () => {
      const key = generateS3Key(['test'], 'document.PDF', {
        addUniqueId: false,
      });

      expect(key).toBe('test/document.pdf');
    });

    it('should handle filename without extension', () => {
      const key = generateS3Key(['test'], 'README', {
        addUniqueId: false,
      });

      expect(key).toBe('test/readme');
    });

    it('should handle empty path segments gracefully', () => {
      const key = generateS3Key(['', 'test', ''], 'file.jpg', {
        addUniqueId: false,
      });

      expect(key).toBe('test/file.jpg');
    });

    it('should preserve original name when preserveName is true', () => {
      const key = generateS3Key(['uploads'], 'IMPORTANT_DOC.PDF', {
        preserveName: true,
        addUniqueId: true,
      });

      // Should preserve IMPORTANT_DOC but still add unique ID and lowercase extension
      expect(key).toMatch(/^uploads\/IMPORTANT_DOC_[a-zA-Z0-9_-]{10}\.pdf$/);
    });

    it('should handle complex real-world scenarios', () => {
      // Practice gallery image
      const key1 = generateS3Key(['practices', '789', 'gallery'], 'sunset-photo-2024.jpg');
      expect(key1).toMatch(/^practices\/789\/gallery\/sunset-photo-2024_[a-zA-Z0-9_-]{10}\.jpg$/);

      // User avatar
      const key2 = generateS3Key(['users', 'user-uuid-123', 'avatar'], 'profile.png');
      expect(key2).toMatch(/^users\/user-uuid-123\/avatar\/profile_[a-zA-Z0-9_-]{10}\.png$/);

      // Organization logo
      const key3 = generateS3Key(['organizations', 'org-456', 'logo'], 'brand.svg');
      expect(key3).toMatch(/^organizations\/org-456\/logo\/brand_[a-zA-Z0-9_-]{10}\.svg$/);
    });
  });

  describe('getPublicUrl', () => {
    it('should convert S3 key to CloudFront URL', () => {
      const url = getPublicUrl('practices/123/logo/logo_xyz.jpg');
      expect(url).toBe('https://cdn.bendcare.com/practices/123/logo/logo_xyz.jpg');
    });

    it('should handle keys with special characters', () => {
      const url = getPublicUrl('users/user-123/avatar/photo_abc.png');
      expect(url).toBe('https://cdn.bendcare.com/users/user-123/avatar/photo_abc.png');
    });

    it('should handle keys with leading slash', () => {
      const url = getPublicUrl('/practices/123/logo.jpg');
      expect(url).toBe('https://cdn.bendcare.com/practices/123/logo.jpg');
    });

    it('should handle CDN URL with trailing slash', () => {
      mockConfig.cdnUrl = 'https://cdn.bendcare.com/';
      const url = getPublicUrl('test/file.jpg');
      expect(url).toBe('https://cdn.bendcare.com/test/file.jpg');
    });
  });

  describe('extractS3Key', () => {
    beforeEach(() => {
      mockConfig.bucket = 'bcos-public-test';
    });

    it('should extract S3 key from CloudFront URL', () => {
      const key = extractS3Key('https://cdn.bendcare.com/practices/123/logo/logo_xyz.jpg');
      expect(key).toBe('practices/123/logo/logo_xyz.jpg');
    });

    it('should extract S3 key from S3 bucket URL (pattern 1)', () => {
      const key = extractS3Key('https://bcos-public-test.s3.amazonaws.com/practices/123/logo.jpg');
      expect(key).toBe('practices/123/logo.jpg');
    });

    it('should extract S3 key from S3 bucket URL (pattern 2 with region)', () => {
      const key = extractS3Key('https://bcos-public-test.s3.us-east-1.amazonaws.com/test/file.jpg');
      expect(key).toBe('test/file.jpg');
    });

    it('should extract S3 key from S3 bucket URL (pattern 3)', () => {
      const key = extractS3Key('https://s3.amazonaws.com/bcos-public-test/test/file.jpg');
      expect(key).toBe('test/file.jpg');
    });

    it('should extract S3 key from S3 bucket URL (pattern 4 with region)', () => {
      const key = extractS3Key('https://s3.us-west-2.amazonaws.com/bcos-public-test/test/file.jpg');
      expect(key).toBe('test/file.jpg');
    });

    it('should return null for non-S3 URLs', () => {
      const key = extractS3Key('https://example.com/some-file.jpg');
      expect(key).toBeNull();
    });

    it('should return null for local URLs', () => {
      const key = extractS3Key('/uploads/practices/logo.jpg');
      expect(key).toBeNull();
    });

    it('should handle URL-encoded keys', () => {
      const key = extractS3Key('https://bcos-public-test.s3.amazonaws.com/test%20folder/file.jpg');
      expect(key).toBe('test folder/file.jpg');
    });

    it('should return null when S3 not configured', () => {
      mockConfig.cdnUrl = '';
      mockConfig.bucket = '';
      const key = extractS3Key('https://cdn.bendcare.com/test/file.jpg');
      expect(key).toBeNull();
    });
  });

  describe('isCloudFrontUrl', () => {
    it('should return true for CloudFront URLs', () => {
      expect(isCloudFrontUrl('https://cdn.bendcare.com/practices/123/logo.jpg')).toBe(true);
    });

    it('should return false for local URLs', () => {
      expect(isCloudFrontUrl('/uploads/logo.jpg')).toBe(false);
    });

    it('should return false for other domains', () => {
      expect(isCloudFrontUrl('https://example.com/file.jpg')).toBe(false);
    });

    it('should return false when CDN URL not configured', () => {
      mockConfig.cdnUrl = '';
      expect(isCloudFrontUrl('https://cdn.bendcare.com/file.jpg')).toBe(false);
    });
  });

  describe('isLocalUrl', () => {
    it('should return true for local URLs with leading slash', () => {
      expect(isLocalUrl('/uploads/practices/logo.jpg')).toBe(true);
    });

    it('should return true for local URLs without leading slash', () => {
      expect(isLocalUrl('uploads/file.jpg')).toBe(true);
    });

    it('should return false for CloudFront URLs', () => {
      expect(isLocalUrl('https://cdn.bendcare.com/practices/123/logo.jpg')).toBe(false);
    });

    it('should return false for S3 URLs', () => {
      expect(isLocalUrl('https://bucket.s3.amazonaws.com/file.jpg')).toBe(false);
    });
  });

  describe('isS3Configured', () => {
    it('should return true when all env vars are set', () => {
      mockS3Enabled = true;
      expect(isS3Configured()).toBe(true);
    });

    it('should return true when region is missing (uses default us-east-1)', () => {
      mockConfig.region = '';
      mockS3Enabled = true;
      expect(isS3Configured()).toBe(true);
    });

    it('should return false when access key is missing', () => {
      mockConfig.accessKeyId = '';
      mockS3Enabled = false;
      expect(isS3Configured()).toBe(false);
    });

    it('should return false when secret key is missing', () => {
      mockConfig.secretAccessKey = '';
      mockS3Enabled = false;
      expect(isS3Configured()).toBe(false);
    });

    it('should return false when bucket is missing', () => {
      mockConfig.bucket = '';
      mockS3Enabled = false;
      expect(isS3Configured()).toBe(false);
    });

    it('should return false when CDN URL is missing', () => {
      mockConfig.cdnUrl = '';
      mockS3Enabled = false;
      expect(isS3Configured()).toBe(false);
    });

    it('should return false when all env vars are empty strings', () => {
      mockConfig = {
        region: '',
        accessKeyId: '',
        secretAccessKey: '',
        bucket: '',
        cdnUrl: '',
      };
      mockS3Enabled = false;
      expect(isS3Configured()).toBe(false);
    });
  });

  describe('getBucketName', () => {
    it('should return bucket name from env', () => {
      mockConfig.bucket = 'test-bucket-123';
      expect(getBucketName()).toBe('test-bucket-123');
    });

    it('should throw error when bucket not configured', () => {
      mockConfig.bucket = '';
      expect(() => getBucketName()).toThrow('S3_PUBLIC_BUCKET environment variable not configured');
    });
  });

  describe('getCdnUrl', () => {
    it('should return CDN URL from env', () => {
      mockConfig.cdnUrl = 'https://cdn.example.com';
      expect(getCdnUrl()).toBe('https://cdn.example.com');
    });

    it('should throw error when CDN URL not configured', () => {
      mockConfig.cdnUrl = '';
      expect(() => getCdnUrl()).toThrow('CDN_URL environment variable not configured');
    });
  });
});
