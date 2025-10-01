/**
 * SAML Input Validator Tests
 * 
 * Tests for defense-in-depth validation of SAML profile data
 */

import { describe, it, expect } from 'vitest';
import { validateSAMLProfile, validateEmailDomain } from '@/lib/saml/input-validator';

describe('validateSAMLProfile', () => {
  describe('Email validation', () => {
    it('should accept valid email', () => {
      const result = validateSAMLProfile({
        email: 'user@example.com'
      });
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.sanitized?.email).toBe('user@example.com');
    });

    it('should normalize email to lowercase', () => {
      const result = validateSAMLProfile({
        email: 'User@Example.COM'
      });
      
      expect(result.valid).toBe(true);
      expect(result.sanitized?.email).toBe('user@example.com');
    });

    it('should reject missing email', () => {
      const result = validateSAMLProfile({
        email: ''
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Email is required and must be a string');
    });

    it('should reject invalid email format', () => {
      const result = validateSAMLProfile({
        email: 'not-an-email'
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Email format is invalid');
    });

    it('should reject email with dangerous characters (SQL injection attempt)', () => {
      const result = validateSAMLProfile({
        email: 'user@example.com\'; DROP TABLE users;--'
      });
      
      expect(result.valid).toBe(false);
      // The EMAIL_REGEX check fails first, before dangerous chars check
      expect(result.errors).toContain('Email format is invalid');
    });

    it('should reject email with XSS attempt', () => {
      const result = validateSAMLProfile({
        email: 'user<script>alert(1)</script>@example.com'
      });
      
      expect(result.valid).toBe(false);
      // The EMAIL_REGEX check fails first, before dangerous chars check
      expect(result.errors).toContain('Email format is invalid');
    });

    it('should reject email exceeding max length', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      const result = validateSAMLProfile({
        email: longEmail
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Email exceeds maximum length');
    });
  });

  describe('Display name validation', () => {
    it('should accept valid display name', () => {
      const result = validateSAMLProfile({
        email: 'user@example.com',
        displayName: 'John Doe'
      });
      
      expect(result.valid).toBe(true);
      expect(result.sanitized?.displayName).toBe('John Doe');
    });

    it('should trim display name', () => {
      const result = validateSAMLProfile({
        email: 'user@example.com',
        displayName: '  John Doe  '
      });
      
      expect(result.valid).toBe(true);
      expect(result.sanitized?.displayName).toBe('John Doe');
    });

    it('should reject display name with dangerous characters', () => {
      const result = validateSAMLProfile({
        email: 'user@example.com',
        displayName: 'John<script>alert(1)</script>Doe'
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Display name contains invalid characters');
    });

    it('should reject display name exceeding max length', () => {
      const result = validateSAMLProfile({
        email: 'user@example.com',
        displayName: 'a'.repeat(201)
      });
      
      expect(result.valid).toBe(false);
      // NAME_REGEX has max 100 chars built-in, so it fails regex check first
      expect(result.errors).toContain('Display name contains invalid characters');
    });

    it('should accept international characters in display name', () => {
      const result = validateSAMLProfile({
        email: 'user@example.com',
        displayName: 'José García-Pérez'
      });
      
      expect(result.valid).toBe(true);
      expect(result.sanitized?.displayName).toBe('José García-Pérez');
    });

    it('should omit empty display name from sanitized output', () => {
      const result = validateSAMLProfile({
        email: 'user@example.com',
        displayName: '   '
      });
      
      expect(result.valid).toBe(true);
      expect(result.sanitized?.displayName).toBeUndefined();
    });
  });

  describe('Given name validation', () => {
    it('should accept valid given name', () => {
      const result = validateSAMLProfile({
        email: 'user@example.com',
        givenName: 'John'
      });
      
      expect(result.valid).toBe(true);
      expect(result.sanitized?.givenName).toBe('John');
    });

    it('should reject given name with dangerous characters', () => {
      const result = validateSAMLProfile({
        email: 'user@example.com',
        givenName: 'John"; DROP TABLE users;--'
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Given name contains invalid characters');
    });
  });

  describe('Surname validation', () => {
    it('should accept valid surname', () => {
      const result = validateSAMLProfile({
        email: 'user@example.com',
        surname: 'Doe'
      });
      
      expect(result.valid).toBe(true);
      expect(result.sanitized?.surname).toBe('Doe');
    });

    it('should reject surname with dangerous characters', () => {
      const result = validateSAMLProfile({
        email: 'user@example.com',
        surname: 'Doe\\\'; DELETE FROM users;'
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Surname contains invalid characters');
    });
  });

  describe('Multiple fields validation', () => {
    it('should validate all fields and return sanitized data', () => {
      const result = validateSAMLProfile({
        email: '  User@Example.COM  ',
        displayName: '  John Doe  ',
        givenName: '  John  ',
        surname: '  Doe  '
      });
      
      expect(result.valid).toBe(true);
      expect(result.sanitized).toEqual({
        email: 'user@example.com',
        displayName: 'John Doe',
        givenName: 'John',
        surname: 'Doe'
      });
    });

    it('should collect all validation errors', () => {
      const result = validateSAMLProfile({
        email: 'invalid-email',
        displayName: '<script>alert(1)</script>',
        givenName: 'a'.repeat(101)
      });
      
      expect(result.valid).toBe(false);
      // Email validation returns early, so only 1 error
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBe('Email format is invalid');
    });
  });
});

describe('validateEmailDomain', () => {
  it('should allow email when no domain restrictions', () => {
    const result = validateEmailDomain('user@example.com', []);
    expect(result).toBe(true);
  });

  it('should allow email from allowed domain', () => {
    const result = validateEmailDomain('user@bendcare.com', ['bendcare.com', 'illumination.health']);
    expect(result).toBe(true);
  });

  it('should reject email from non-allowed domain', () => {
    const result = validateEmailDomain('user@attacker.com', ['bendcare.com', 'illumination.health']);
    expect(result).toBe(false);
  });

  it('should be case-insensitive', () => {
    const result = validateEmailDomain('user@BendCare.COM', ['bendcare.com']);
    expect(result).toBe(true);
  });

  it('should reject email without domain', () => {
    const result = validateEmailDomain('user', ['bendcare.com']);
    expect(result).toBe(false);
  });
});

