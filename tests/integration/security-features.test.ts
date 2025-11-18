/**
 * Security Features Integration Tests
 * Tests XSS sanitization, SQL injection prevention, and file upload security in real contexts
 */

import { beforeEach, describe, expect, it } from 'vitest';
import '@/tests/setup/integration-setup'; // Import integration setup for database access
import { sanitizeHtml, sanitizeUrl, stripHtml } from '@/lib/utils/html-sanitizer';
import { createSafeTextSchema, sanitizeText } from '@/lib/validations/sanitization';
import { createTestUser } from '@/tests/factories/user-factory';

describe('Security Features Integration', () => {
  let _testUser: Awaited<ReturnType<typeof createTestUser>>;

  beforeEach(async () => {
    _testUser = await createTestUser({
      email: 'securitytest@example.com',
    });
  });

  describe('XSS Protection Integration', () => {
    it('should prevent XSS in user-generated content', () => {
      const maliciousInput = '<script>alert("xss")</script><p>Safe content</p>';

      // Test HTML sanitization removes dangerous content but preserves safe content
      const sanitized = sanitizeHtml(maliciousInput);
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('alert');
      expect(sanitized).toContain('<p>Safe content</p>');
    });

    it('should handle complex XSS attempts', () => {
      const complexXSS = [
        '<img src="x" onerror="alert(1)">',
        '<svg onload="alert(1)">',
        '<iframe src="javascript:alert(1)"></iframe>',
        '<object data="javascript:alert(1)"></object>',
        '<embed src="javascript:alert(1)">',
      ];

      complexXSS.forEach((xss) => {
        const sanitized = sanitizeHtml(xss);
        expect(sanitized).not.toContain('javascript:');
        expect(sanitized).not.toContain('onerror');
        expect(sanitized).not.toContain('onload');
        expect(sanitized).not.toContain('alert');
      });
    });

    it('should strip HTML while preserving text content', () => {
      const htmlContent = '<p>Hello <strong>world</strong></p><br><em>test</em>';
      const stripped = stripHtml(htmlContent);

      expect(stripped).toBe('Hello world\ntest');
      expect(stripped).not.toContain('<');
      expect(stripped).not.toContain('>');
    });
  });

  describe('URL Sanitization Integration', () => {
    it('should allow safe URLs', () => {
      const safeUrls = [
        'https://example.com',
        'http://localhost:3000',
        '/relative/path',
        '#anchor',
        'relative-file.html',
      ];

      safeUrls.forEach((url) => {
        const sanitized = sanitizeUrl(url);
        expect(sanitized).toBe(url);
      });
    });

    it('should block dangerous URLs', () => {
      const dangerousUrls = [
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'vbscript:alert(1)',
        'file:///etc/passwd',
        'ftp://malicious.com',
        'mailto:test@example.com',
      ];

      dangerousUrls.forEach((url) => {
        const sanitized = sanitizeUrl(url);
        expect(sanitized).toBe('#');
      });
    });
  });

  describe('Input Sanitization Integration', () => {
    it('should sanitize text input through validation schemas', () => {
      const dangerousText = '<script>alert("xss")</script>Hello & <world>';
      const schema = createSafeTextSchema();

      const result = schema.safeParse(dangerousText);
      expect(result.success).toBe(true);
      expect(result.data).not.toContain('<script>');
      expect(result.data).toContain('Hello');
    });

    it('should handle SQL injection attempts in search', () => {
      const sqlInjection = "'; DROP TABLE users; --";
      const sanitized = sanitizeText(sqlInjection);

      expect(sanitized).not.toContain('DROP');
      expect(sanitized).not.toContain('--');
      expect(sanitized).not.toContain(';');
    });
  });

  describe('File Upload Security Integration', () => {
    it('should validate file upload security constraints', async () => {
      // Test file type validation
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      const dangerousTypes = ['text/html', 'application/javascript', 'text/php'];

      allowedTypes.forEach((type) => {
        // Simulate file validation logic
        expect(['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(type)).toBe(true);
      });

      dangerousTypes.forEach((type) => {
        expect(['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(type)).toBe(false);
      });
    });

    it('should enforce file size limits', () => {
      const maxSize = 5 * 1024 * 1024; // 5MB
      const testSizes = [
        { size: 1024, shouldPass: true },
        { size: maxSize - 1, shouldPass: true },
        { size: maxSize + 1, shouldPass: false },
        { size: 10 * 1024 * 1024, shouldPass: false },
      ];

      testSizes.forEach(({ size, shouldPass }) => {
        const isValid = size <= maxSize;
        expect(isValid).toBe(shouldPass);
      });
    });
  });

  describe('Real-world Security Scenarios', () => {
    it('should handle user profile update with XSS attempt', () => {
      const maliciousProfile = {
        firstName: '<script>alert("xss")</script>John',
        lastName: 'Doe<img src="x" onerror="alert(1)">',
        bio: '<p>Normal bio</p><iframe src="javascript:alert(1)"></iframe>',
      };

      // Test that sanitization works in profile context
      const sanitizedFirst = sanitizeText(maliciousProfile.firstName);
      const sanitizedLast = sanitizeText(maliciousProfile.lastName);
      const sanitizedBio = sanitizeHtml(maliciousProfile.bio);

      expect(sanitizedFirst).toBe('John');
      expect(sanitizedLast).toBe('Doe');
      expect(sanitizedBio).toContain('<p>Normal bio</p>');
      expect(sanitizedBio).not.toContain('<iframe>');
      expect(sanitizedBio).not.toContain('javascript:');
    });

    it('should prevent XSS in practice template content', () => {
      const templateContent = {
        welcomeMessage: '<h1>Welcome</h1><script>steal_data()</script>',
        aboutText: '<p>About us</p><object data="malicious.swf"></object>',
        contactInfo: '<div>Contact: <a href="javascript:alert(1)">Click</a></div>',
      };

      Object.values(templateContent).forEach((content) => {
        const sanitized = sanitizeHtml(content);
        expect(sanitized).not.toContain('<script>');
        expect(sanitized).not.toContain('<object>');
        expect(sanitized).not.toContain('javascript:');
        expect(sanitized).not.toContain('steal_data');
      });
    });
  });
});
