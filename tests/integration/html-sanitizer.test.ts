/**
 * Integration tests for HTML sanitizer
 * These tests use the real DOMPurify (no mocking) to verify actual behavior
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from '@/lib/utils/html-sanitizer';

describe('html-sanitizer integration', () => {
  describe('tabnabbing protection', () => {
    it('should add rel="noopener noreferrer" to target="_blank" links', () => {
      const input = '<a href="https://example.com" target="_blank">Link</a>';

      const result = sanitizeHtml(input);

      // The afterSanitizeAttributes hook should add rel="noopener noreferrer"
      expect(result).toContain('rel="noopener noreferrer"');
      expect(result).toContain('target="_blank"');
      expect(result).toContain('href="https://example.com"');
    });

    it('should override existing rel attribute with noopener noreferrer', () => {
      // Even if someone tries to set a different rel, our hook enforces the safe value
      const input = '<a href="https://example.com" target="_blank" rel="something">Link</a>';

      const result = sanitizeHtml(input);

      expect(result).toContain('rel="noopener noreferrer"');
      expect(result).not.toContain('rel="something"');
    });

    it('should not modify links without target="_blank"', () => {
      const input = '<a href="https://example.com">Link</a>';

      const result = sanitizeHtml(input);

      // Link without target="_blank" should not have rel added
      expect(result).not.toContain('rel=');
      expect(result).toContain('href="https://example.com"');
    });

    it('should not modify links with other target values', () => {
      const input = '<a href="https://example.com" target="_self">Link</a>';

      const result = sanitizeHtml(input);

      // target="_self" doesn't need noopener protection
      expect(result).not.toContain('rel=');
      expect(result).toContain('target="_self"');
    });
  });

  describe('XSS protection', () => {
    it('should remove script tags', () => {
      const input = '<p>Hello</p><script>alert("xss")</script>';

      const result = sanitizeHtml(input);

      expect(result).not.toContain('<script>');
      expect(result).not.toContain('alert');
      expect(result).toContain('<p>Hello</p>');
    });

    it('should remove event handlers', () => {
      const input = '<a href="#" onclick="alert(\'xss\')">Click</a>';

      const result = sanitizeHtml(input);

      expect(result).not.toContain('onclick');
      expect(result).toContain('<a');
      expect(result).toContain('href="#"');
    });

    it('should remove javascript: URLs', () => {
      const input = '<a href="javascript:alert(\'xss\')">Click</a>';

      const result = sanitizeHtml(input);

      expect(result).not.toContain('javascript:');
    });
  });
});
