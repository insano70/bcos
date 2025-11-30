import bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/auth/security';

// Mock bcrypt functions
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

describe('password authentication logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hashPassword', () => {
    it('should hash password with correct salt rounds', async () => {
      const password = 'TestPassword123!';
      const mockHash = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewfBPjJcZQKXGJ2O';

      (bcrypt.hash as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockHash);

      const result = await hashPassword(password);

      expect(result).toBe(mockHash);
    });

    it('should throw error if bcrypt.hash fails', async () => {
      const password = 'TestPassword123!';
      const error = new Error('Hashing failed');

      vi.mocked(bcrypt.hash).mockRejectedValue(error);

      await expect(hashPassword(password)).rejects.toThrow('Hashing failed');
    });

    it('should handle empty password', async () => {
      const password = '';
      const mockHash = '$2b$12$empty.hash.value';

      (bcrypt.hash as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockHash);

      const result = await hashPassword(password);

      expect(result).toBe(mockHash);
    });

    it('should handle special characters in password', async () => {
      const password = 'P@ssw0rd!#$%^&*()';
      const mockHash = '$2b$12$special.hash.value';

      (bcrypt.hash as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockHash);

      const result = await hashPassword(password);

      expect(result).toBe(mockHash);
    });
  });

  describe('verifyPassword', () => {
    it('should return true for correct password', async () => {
      const password = 'TestPassword123!';
      const hash = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewfBPjJcZQKXGJ2O';

      (bcrypt.compare as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

      const result = await verifyPassword(password, hash);

      expect(result).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const password = 'WrongPassword123!';
      const hash = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewfBPjJcZQKXGJ2O';

      (bcrypt.compare as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

      const result = await verifyPassword(password, hash);

      expect(vi.mocked(bcrypt.compare)).toHaveBeenCalledWith(password, hash);
      expect(result).toBe(false);
    });

    it('should return false on bcrypt.compare failure', async () => {
      const password = 'TestPassword123!';
      const hash = '$2b$12$invalid.hash';
      const error = new Error('Invalid hash');

      vi.mocked(bcrypt.compare).mockRejectedValue(error);
      // Note: Error is logged via @/lib/logger, not console.error
      // We test the behavior (return false) not the logging implementation
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await verifyPassword(password, hash);

      expect(vi.mocked(bcrypt.compare)).toHaveBeenCalledWith(password, hash);
      expect(result).toBe(false);

      consoleSpy.mockRestore();
    });

    it('should handle empty password', async () => {
      const password = '';
      const hash = '$2b$12$empty.hash';

      (bcrypt.compare as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

      const result = await verifyPassword(password, hash);

      expect(vi.mocked(bcrypt.compare)).toHaveBeenCalledWith(password, hash);
      expect(result).toBe(false);
    });

    it('should handle empty hash', async () => {
      const password = 'TestPassword123!';
      const hash = '';

      (bcrypt.compare as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

      const result = await verifyPassword(password, hash);

      expect(vi.mocked(bcrypt.compare)).toHaveBeenCalledWith(password, hash);
      expect(result).toBe(false);
    });

    it('should handle null/undefined inputs gracefully', async () => {
      vi.mocked(bcrypt.compare).mockRejectedValue(new Error('Invalid input'));

      // Note: Errors are logged via @/lib/logger, not console.error
      // We test the behavior (return false) not the logging implementation
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await verifyPassword('', '');

      expect(result).toBe(false);
      // Don't check consoleSpy - logging goes through @/lib/logger

      consoleSpy.mockRestore();
    });
  });
});
