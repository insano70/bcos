/**
 * Unit tests for S3 Private Assets Service
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Default mock config that can be modified per test
const defaultMockConfig = {
  region: 'us-east-1',
  accessKeyId: 'AKIATEST',
  secretAccessKey: 'secrettest',
  bucket: 'test-bucket',
  uploadExpiration: 3600,
  downloadExpiration: 900,
};

// Create mutable config that tests can modify
let mockConfig = { ...defaultMockConfig };
let mockS3Enabled = true;

// Mock the env module before importing S3 service
vi.mock('@/lib/env', () => ({
  getPrivateS3Config: vi.fn(() => ({ ...mockConfig })),
  isPrivateS3Enabled: vi.fn(() => mockS3Enabled),
  env: {
    S3_PRIVATE_REGION: 'us-east-1',
    S3_PRIVATE_ACCESS_KEY_ID: 'AKIATEST',
    S3_PRIVATE_SECRET_ACCESS_KEY: 'secrettest',
    S3_PRIVATE_BUCKET: 'test-bucket',
  },
}));

import { getPrivateS3Config, isPrivateS3Enabled } from '@/lib/env';
import {
  extractS3Key,
  generateS3Key,
  generateUploadUrl,
  getBucketName,
  getExpirationTime,
  isExpired,
  isPresignedUrl,
  isS3Configured,
} from '@/lib/s3/private-assets';
import { FILE_SIZE_LIMITS } from '@/lib/s3/private-assets/constants';
import {
  preventPathTraversal,
  sanitizeFileName,
  sanitizePathSegment,
} from '@/lib/s3/shared/sanitization';

describe('S3 Private Assets Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock config to defaults
    mockConfig = { ...defaultMockConfig };
    mockS3Enabled = true;
    vi.mocked(getPrivateS3Config).mockImplementation(() => ({ ...mockConfig }));
    vi.mocked(isPrivateS3Enabled).mockImplementation(() => mockS3Enabled);
  });

  describe('generateS3Key', () => {
    it('should generate key with default options (unique ID)', () => {
      const key = generateS3Key(['work-items', 'abc-123', 'attachments'], 'document.pdf');

      // Should match pattern: work-items/abc-123/attachments/document_{uniqueId}.pdf
      expect(key).toMatch(/^work-items\/abc-123\/attachments\/document_[a-zA-Z0-9_-]{10}\.pdf$/);
    });

    it('should generate key without unique ID when disabled', () => {
      const key = generateS3Key(['work-items', 'abc-123', 'attachments'], 'report.pdf', {
        addUniqueId: false,
      });

      expect(key).toBe('work-items/abc-123/attachments/report.pdf');
    });

    it('should generate key with timestamp when enabled', () => {
      const key = generateS3Key(['reports', 'org-456', 'analytics'], 'report.xlsx', {
        addTimestamp: true,
        addUniqueId: false,
      });

      // Should match pattern: reports/org-456/analytics/report_{timestamp}.xlsx
      expect(key).toMatch(/^reports\/org-456\/analytics\/report_\d{13}\.xlsx$/);
    });

    it('should generate key with both timestamp and unique ID', () => {
      const key = generateS3Key(['backups', 'database'], 'backup.sql.gz', {
        addTimestamp: true,
        addUniqueId: true,
      });

      // Should match pattern: backups/database/backup.sql_{timestamp}_{uniqueId}.gz
      // Note: The .sql becomes part of the filename before the unique suffix
      expect(key).toMatch(/^backups\/database\/backup\.sql_\d{13}_[a-zA-Z0-9_-]{10}\.gz$/);
    });

    it('should handle multiple path segments for nested resources', () => {
      const key = generateS3Key(
        ['work-items', 'parent-123', 'children', 'child-456', 'attachments'],
        'screenshot.jpg',
        { addUniqueId: false }
      );

      expect(key).toBe('work-items/parent-123/children/child-456/attachments/screenshot.jpg');
    });

    it('should sanitize filename with special characters', () => {
      const key = generateS3Key(['invoices', 'org-789'], 'My Invoice (Draft).pdf', {
        addUniqueId: false,
      });

      expect(key).toBe('invoices/org-789/my_invoice_draft.pdf');
    });

    it('should sanitize path segments with special characters', () => {
      const key = generateS3Key(
        ['users', 'user@example.com', 'documents'],
        'license.jpg',
        { addUniqueId: false }
      );

      expect(key).toBe('users/user-example-com/documents/license.jpg');
    });

    it('should preserve file extension in lowercase', () => {
      const key = generateS3Key(['practices', 'practice-123', 'policies'], 'HIPAA.PDF', {
        addUniqueId: false,
      });

      expect(key).toBe('practices/practice-123/policies/hipaa.pdf');
    });

    it('should handle filename without extension', () => {
      const key = generateS3Key(['backups', 'configs'], 'config', {
        addUniqueId: false,
      });

      expect(key).toBe('backups/configs/config');
    });

    it('should handle empty path segments gracefully', () => {
      const key = generateS3Key(['', 'work-items', '', 'attachments'], 'file.pdf', {
        addUniqueId: false,
      });

      expect(key).toBe('work-items/attachments/file.pdf');
    });

    it('should preserve original name when preserveName is true', () => {
      const key = generateS3Key(['users', 'user-456', 'documents'], 'IMPORTANT_DOC.PDF', {
        preserveName: true,
        addUniqueId: true,
      });

      // Should preserve IMPORTANT_DOC but still add unique ID and lowercase extension
      expect(key).toMatch(/^users\/user-456\/documents\/IMPORTANT_DOC_[a-zA-Z0-9_-]{10}\.pdf$/);
    });

    it('should handle real-world work item attachment scenario', () => {
      const workItemId = 'work-item-uuid-123';
      const key = generateS3Key(['work-items', workItemId, 'attachments'], 'project-plan.docx');

      expect(key).toMatch(
        /^work-items\/work-item-uuid-123\/attachments\/project-plan_[a-zA-Z0-9_-]{10}\.docx$/
      );
    });

    it('should handle invoice scenario', () => {
      const key = generateS3Key(['invoices', 'org-456', '2024', 'january'], 'invoice.pdf');

      expect(key).toMatch(/^invoices\/org-456\/2024\/january\/invoice_[a-zA-Z0-9_-]{10}\.pdf$/);
    });

    it('should handle user document scenario', () => {
      const key = generateS3Key(['users', 'user-789', 'documents', 'licenses'], 'medical-license.jpg');

      expect(key).toMatch(/^users\/user-789\/documents\/licenses\/medical-license_[a-zA-Z0-9_-]{10}\.jpg$/);
    });

    it('should sanitize path segments containing traversal patterns', () => {
      // Path traversal patterns in segments get sanitized before preventPathTraversal check
      // '../../../etc' becomes 'etc' after sanitization (dots removed, hyphens trimmed)
      const key = generateS3Key(['work-items', '../../../etc', 'passwd'], 'file.txt', {
        addUniqueId: false,
      });

      // Segments are sanitized, so the path is safe
      expect(key).toBe('work-items/etc/passwd/file.txt');
    });
  });

  describe('Shared Sanitization Functions', () => {
    describe('sanitizePathSegment', () => {
      it('should sanitize special characters to hyphens', () => {
        expect(sanitizePathSegment('user@example.com')).toBe('user-example-com');
        expect(sanitizePathSegment('My Practice Name')).toBe('My-Practice-Name');
      });

      it('should collapse multiple hyphens', () => {
        expect(sanitizePathSegment('test---segment')).toBe('test-segment');
      });

      it('should remove leading and trailing hyphens', () => {
        expect(sanitizePathSegment('-test-')).toBe('test');
      });

      it('should trim whitespace', () => {
        expect(sanitizePathSegment('  test  ')).toBe('test');
      });
    });

    describe('sanitizeFileName', () => {
      it('should sanitize to lowercase by default', () => {
        expect(sanitizeFileName('MyFile.PDF')).toBe('myfile.pdf');
      });

      it('should replace special characters with underscores', () => {
        expect(sanitizeFileName('My File (Draft).pdf')).toBe('my_file_draft.pdf');
      });

      it('should preserve name when preserveName is true', () => {
        expect(sanitizeFileName('IMPORTANT_DOC.PDF', true)).toBe('IMPORTANT_DOC.pdf');
      });

      it('should handle files without extensions', () => {
        expect(sanitizeFileName('README')).toBe('readme');
      });

      it('should preserve double extensions like tar.gz', () => {
        // Double extensions like .tar.gz are preserved correctly
        // 'archive.tar.gz' splits to name='archive.tar' and ext='gz'
        expect(sanitizeFileName('archive.tar.gz')).toBe('archive.tar.gz');
      });
    });

    describe('preventPathTraversal', () => {
      it('should throw error on .. in path', () => {
        expect(() => preventPathTraversal('work-items/../etc/passwd')).toThrow('Path traversal detected');
      });

      it('should throw error on // in path', () => {
        expect(() => preventPathTraversal('work-items//attachments')).toThrow('Path traversal detected');
      });

      it('should not throw on valid paths', () => {
        expect(() => preventPathTraversal('work-items/abc-123/attachments/file.pdf')).not.toThrow();
      });
    });
  });

  describe('URL Utilities', () => {
    beforeEach(() => {
      mockConfig.bucket = 'bcos-private-test';
    });

    describe('extractS3Key', () => {
      it('should extract S3 key from presigned URL (pattern 1)', () => {
        const url = 'https://bcos-private-test.s3.amazonaws.com/work-items/abc/doc.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256';
        const key = extractS3Key(url);
        expect(key).toBe('work-items/abc/doc.pdf');
      });

      it('should extract S3 key from presigned URL (pattern 2 with region)', () => {
        const url = 'https://bcos-private-test.s3.us-east-1.amazonaws.com/invoices/org/invoice.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256';
        const key = extractS3Key(url);
        expect(key).toBe('invoices/org/invoice.pdf');
      });

      it('should extract S3 key from presigned URL (pattern 3)', () => {
        const url = 'https://s3.amazonaws.com/bcos-private-test/reports/report.xlsx?X-Amz-Signature=abc';
        const key = extractS3Key(url);
        expect(key).toBe('reports/report.xlsx');
      });

      it('should return null for non-S3 URLs', () => {
        const key = extractS3Key('https://example.com/some-file.pdf');
        expect(key).toBeNull();
      });

      it('should handle URL-encoded keys', () => {
        const url = 'https://bcos-private-test.s3.amazonaws.com/work-items/test%20folder/file.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256';
        const key = extractS3Key(url);
        expect(key).toBe('work-items/test folder/file.pdf');
      });
    });

    describe('isPresignedUrl', () => {
      it('should return true for valid presigned URLs', () => {
        const url = 'https://bucket.s3.amazonaws.com/key?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIA&X-Amz-Date=20240101T000000Z&X-Amz-Expires=3600&X-Amz-Signature=abc';
        expect(isPresignedUrl(url)).toBe(true);
      });

      it('should return false for URLs missing signature parameters', () => {
        const url = 'https://bucket.s3.amazonaws.com/key?random=param';
        expect(isPresignedUrl(url)).toBe(false);
      });

      it('should return false for non-URL strings', () => {
        expect(isPresignedUrl('not-a-url')).toBe(false);
      });
    });

    describe('isExpired', () => {
      it('should return true for expired URLs', () => {
        // Create a URL that expired 1 hour ago
        const pastDate = new Date(Date.now() - 3600 * 1000);
        const dateStr = `${pastDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
        const url = `https://bucket.s3.amazonaws.com/key?X-Amz-Date=${dateStr}&X-Amz-Expires=1800`;
        expect(isExpired(url)).toBe(true);
      });

      it('should return false for non-expired URLs', () => {
        // Create a URL that expires in 1 hour
        const futureDate = new Date();
        const dateStr = `${futureDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
        const url = `https://bucket.s3.amazonaws.com/key?X-Amz-Date=${dateStr}&X-Amz-Expires=7200`;
        expect(isExpired(url)).toBe(false);
      });

      it('should return true for URLs missing expiration parameters', () => {
        const url = 'https://bucket.s3.amazonaws.com/key';
        expect(isExpired(url)).toBe(true);
      });
    });

    describe('getExpirationTime', () => {
      it('should extract expiration timestamp from presigned URL', () => {
        const now = new Date();
        const dateStr = `${now.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
        const url = `https://bucket.s3.amazonaws.com/key?X-Amz-Date=${dateStr}&X-Amz-Expires=900`;

        const expiresAt = getExpirationTime(url);
        expect(expiresAt).not.toBeNull();
        expect(typeof expiresAt).toBe('number');
        if (expiresAt) {
          expect(expiresAt > Date.now()).toBe(true);
        }
      });

      it('should return null for URLs without expiration parameters', () => {
        const url = 'https://bucket.s3.amazonaws.com/key';
        expect(getExpirationTime(url)).toBeNull();
      });
    });
  });

  describe('MIME Type Validation', () => {
    it('should accept allowed MIME types - PDF', async () => {
      await expect(
        generateUploadUrl('test/file.pdf', { contentType: 'application/pdf' })
      ).resolves.toBeDefined();
    });

    it('should accept allowed MIME types - JPEG', async () => {
      await expect(
        generateUploadUrl('test/file.jpg', { contentType: 'image/jpeg' })
      ).resolves.toBeDefined();
    });

    it('should accept allowed MIME types - Word document', async () => {
      await expect(
        generateUploadUrl('test/file.docx', {
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        })
      ).resolves.toBeDefined();
    });

    it('should reject executable MIME types', async () => {
      await expect(
        generateUploadUrl('test/file.exe', { contentType: 'application/x-msdownload' })
      ).rejects.toThrow('Unsupported content type');
    });

    it('should reject script MIME types', async () => {
      await expect(
        generateUploadUrl('test/file.sh', { contentType: 'application/x-sh' })
      ).rejects.toThrow('Unsupported content type');
    });

    it('should reject unknown MIME types', async () => {
      await expect(
        generateUploadUrl('test/file.xyz', { contentType: 'application/x-custom' })
      ).rejects.toThrow('Unsupported content type');
    });

    it('should provide helpful error message for rejected types', async () => {
      try {
        await generateUploadUrl('test/file.exe', { contentType: 'application/octet-stream' });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Unsupported content type');
        expect((error as Error).message).toContain('application/octet-stream');
      }
    });
  });

  describe('File Size Validation', () => {
    it('should accept file within default limit (100MB)', async () => {
      await expect(
        generateUploadUrl('test/file.pdf', {
          contentType: 'application/pdf',
          maxFileSize: 50 * 1024 * 1024, // 50MB
        })
      ).resolves.toBeDefined();
    });

    it('should accept file at exactly the limit', async () => {
      await expect(
        generateUploadUrl('test/file.pdf', {
          contentType: 'application/pdf',
          maxFileSize: 100 * 1024 * 1024, // 100MB
        })
      ).resolves.toBeDefined();
    });

    it('should reject file exceeding absolute max (500MB)', async () => {
      await expect(
        generateUploadUrl('test/file.zip', {
          contentType: 'application/zip',
          maxFileSize: 600 * 1024 * 1024, // 600MB
        })
      ).rejects.toThrow('maxFileSize cannot exceed 500MB');
    });

    it('should reject negative file size', async () => {
      await expect(
        generateUploadUrl('test/file.pdf', {
          contentType: 'application/pdf',
          maxFileSize: -1,
        })
      ).rejects.toThrow('maxFileSize must be at least 1 byte');
    });

    it('should reject zero file size', async () => {
      await expect(
        generateUploadUrl('test/file.pdf', {
          contentType: 'application/pdf',
          maxFileSize: 0,
        })
      ).rejects.toThrow('maxFileSize must be at least 1 byte');
    });

    it('should use default max file size (100MB) when not specified', async () => {
      const result = await generateUploadUrl('test/file.pdf', {
        contentType: 'application/pdf',
      });

      expect(result).toBeDefined();
      expect(result.uploadUrl).toBeTruthy();
    });

    it('should respect custom file size limits for images', async () => {
      const imageLimit = FILE_SIZE_LIMITS.image; // 10MB
      await expect(
        generateUploadUrl('test/image.jpg', {
          contentType: 'image/jpeg',
          maxFileSize: imageLimit,
        })
      ).resolves.toBeDefined();
    });

    it('should respect custom file size limits for documents', async () => {
      const documentLimit = FILE_SIZE_LIMITS.document; // 50MB
      await expect(
        generateUploadUrl('test/doc.pdf', {
          contentType: 'application/pdf',
          maxFileSize: documentLimit,
        })
      ).resolves.toBeDefined();
    });
  });

  describe('Configuration', () => {
    describe('isS3Configured', () => {
      it('should return true when all env vars are set', () => {
        mockS3Enabled = true;
        expect(isS3Configured()).toBe(true);
      });

      it('should return true when region is missing (uses default)', () => {
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
    });

    describe('getBucketName', () => {
      it('should return bucket name from env', () => {
        mockConfig.bucket = 'test-bucket-123';
        expect(getBucketName()).toBe('test-bucket-123');
      });

      it('should throw error when bucket not configured', () => {
        mockConfig.bucket = '';
        expect(() => getBucketName()).toThrow('S3_PRIVATE_BUCKET environment variable not configured');
      });
    });
  });
});
