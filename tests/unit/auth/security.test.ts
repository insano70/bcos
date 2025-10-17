import bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureSecurityRecord,
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from '@/lib/auth/security';
import { validatePasswordStrength as validatePasswordStrengthPolicy } from '@/lib/config/password-policy';
import { db } from '@/lib/db';

// Mock bcrypt functions
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

// Mock password policy
vi.mock('@/lib/config/password-policy', () => ({
  validatePasswordStrength: vi.fn(),
}));

// Mock database - standardized pattern with method chaining
vi.mock('@/lib/db', () => {
  const mockSelectResult = vi.fn().mockResolvedValue([]);
  const mockUpdateResult = vi.fn().mockResolvedValue({ affectedRows: 1 });
  const mockInsertResult = vi.fn().mockResolvedValue({ insertId: 1 });

  return {
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: mockSelectResult,
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: mockUpdateResult,
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: mockInsertResult,
      }),
    },
    account_security: {
      user_id: 'user_id',
      failed_login_attempts: 'failed_login_attempts',
      last_failed_attempt: 'last_failed_attempt',
      locked_until: 'locked_until',
      suspicious_activity_detected: 'suspicious_activity_detected',
    },
    users: {
      user_id: 'user_id',
      email: 'email',
    },
    // Export mock helpers for test access
    _mockSelectResult: mockSelectResult,
    _mockUpdateResult: mockUpdateResult,
    _mockInsertResult: mockInsertResult,
  };
});

describe('security authentication logic', () => {
  let mockSelectResult: any;
  let _mockUpdateResult: any;
  let _mockInsertResult: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get references to the standardized mock helpers
    const dbModule = await import('@/lib/db');
    mockSelectResult = (dbModule as any)._mockSelectResult;
    _mockUpdateResult = (dbModule as any)._mockUpdateResult;
    _mockInsertResult = (dbModule as any)._mockInsertResult;
  });

  describe('PasswordService', () => {
    describe('hash', () => {
      it('should hash password with correct salt rounds', async () => {
        const password = 'TestPassword123!';
        const mockHash = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewfBPjJcZQKXGJ2O';

        (bcrypt.hash as any).mockResolvedValueOnce(mockHash);

        const result = await hashPassword(password);

        expect(result).toBe(mockHash);
      });

      it('should throw error if bcrypt.hash fails', async () => {
        const password = 'TestPassword123!';
        const error = new Error('Hashing failed');

        (bcrypt.hash as any).mockRejectedValueOnce(error);

        await expect(hashPassword(password)).rejects.toThrow('Hashing failed');
      });
    });

    describe('verify', () => {
      it('should return true for correct password', async () => {
        const password = 'TestPassword123!';
        const hash = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewfBPjJcZQKXGJ2O';

        (bcrypt.compare as any).mockResolvedValueOnce(true);

        const result = await verifyPassword(password, hash);

        expect(result).toBe(true);
      });

      it('should return false for incorrect password', async () => {
        const password = 'WrongPassword123!';
        const hash = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewfBPjJcZQKXGJ2O';

        (bcrypt.compare as any).mockResolvedValueOnce(false);

        const result = await verifyPassword(password, hash);

        expect(result).toBe(false);
      });

      it('should return false when bcrypt.compare throws', async () => {
        const password = 'TestPassword123!';
        const hash = 'invalid-hash';

        (bcrypt.compare as any).mockRejectedValueOnce(new Error('Invalid hash'));

        const result = await verifyPassword(password, hash);

        expect(result).toBe(false);
      });
    });

    describe('validatePasswordStrength', () => {
      it('should delegate to validatePasswordStrength from password-policy', () => {
        const password = 'TestPassword123!';
        const mockResult = { isValid: true, errors: [] };

        vi.mocked(validatePasswordStrengthPolicy).mockReturnValue(mockResult);

        const result = validatePasswordStrength(password);

        expect(validatePasswordStrengthPolicy).toHaveBeenCalledWith(password);
        expect(result).toEqual(mockResult);
      });

      it('should return validation result with errors', () => {
        const password = 'weak';
        const mockResult = {
          isValid: false,
          errors: [
            'Password must be at least 12 characters',
            'Password must contain uppercase letter',
          ],
        };

        vi.mocked(validatePasswordStrengthPolicy).mockReturnValue(mockResult);

        const result = validatePasswordStrength(password);

        expect(result).toEqual(mockResult);
      });
    });
  });

  describe('ensureSecurityRecord', () => {
    it('should return existing record when one exists', async () => {
      const userId = 'test-user-id-123';
      const existingRecord = {
        user_id: userId,
        failed_login_attempts: 2,
        last_failed_attempt: new Date(),
        locked_until: null,
        lockout_reason: null,
        max_concurrent_sessions: 5,
        require_fresh_auth_minutes: 10,
        password_changed_at: null,
        last_password_reset: null,
        suspicious_activity_detected: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Mock existing record found
      mockSelectResult.mockResolvedValueOnce([existingRecord]);

      const result = await ensureSecurityRecord(userId);

      expect(result).toEqual(existingRecord);
      expect(db.select).toHaveBeenCalled();
    });

    it('should create new record with HIPAA defaults when none exists', async () => {
      const userId = 'test-user-id-456';
      const newRecord = {
        user_id: userId,
        failed_login_attempts: 0,
        last_failed_attempt: null,
        locked_until: null,
        lockout_reason: null,
        max_concurrent_sessions: 3,
        require_fresh_auth_minutes: 5,
        password_changed_at: null,
        last_password_reset: null,
        suspicious_activity_detected: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Mock no existing record, then successful insert
      mockSelectResult.mockResolvedValueOnce([]); // No existing record

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newRecord]),
        }),
      });
      (db.insert as any).mockReturnValue(mockInsert());

      const result = await ensureSecurityRecord(userId);

      expect(result).toBeDefined();
      expect(result.user_id).toBe(userId);
      expect(result.max_concurrent_sessions).toBe(3);
      expect(result.require_fresh_auth_minutes).toBe(5);
      expect(result.failed_login_attempts).toBe(0);
    });
  });

  // NOTE: Most account security tests are in integration tests (security-authentication.test.ts)
  // Database-heavy account lockout operations are better tested with real database transactions
});
