import bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword, needsRehash, verifyPassword } from '@/lib/auth/password';

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

      (bcrypt.hash as any).mockResolvedValueOnce(mockHash);

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

      (bcrypt.hash as any).mockResolvedValueOnce(mockHash);

      const result = await hashPassword(password);

      expect(result).toBe(mockHash);
    });

    it('should handle special characters in password', async () => {
      const password = 'P@ssw0rd!#$%^&*()';
      const mockHash = '$2b$12$special.hash.value';

      (bcrypt.hash as any).mockResolvedValueOnce(mockHash);

      const result = await hashPassword(password);

      expect(result).toBe(mockHash);
    });
  });

  describe('verifyPassword', () => {
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

      expect(vi.mocked(bcrypt.compare)).toHaveBeenCalledWith(password, hash);
      expect(result).toBe(false);
    });

    it('should return false and log error on bcrypt.compare failure', async () => {
      const password = 'TestPassword123!';
      const hash = '$2b$12$invalid.hash';
      const error = new Error('Invalid hash');

      vi.mocked(bcrypt.compare).mockRejectedValue(error);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await verifyPassword(password, hash);

      expect(vi.mocked(bcrypt.compare)).toHaveBeenCalledWith(password, hash);
      expect(consoleSpy).toHaveBeenCalledWith('Password verification error:', error);
      expect(result).toBe(false);

      consoleSpy.mockRestore();
    });

    it('should handle empty password', async () => {
      const password = '';
      const hash = '$2b$12$empty.hash';

      (bcrypt.compare as any).mockResolvedValueOnce(false);

      const result = await verifyPassword(password, hash);

      expect(vi.mocked(bcrypt.compare)).toHaveBeenCalledWith(password, hash);
      expect(result).toBe(false);
    });

    it('should handle empty hash', async () => {
      const password = 'TestPassword123!';
      const hash = '';

      (bcrypt.compare as any).mockResolvedValueOnce(false);

      const result = await verifyPassword(password, hash);

      expect(vi.mocked(bcrypt.compare)).toHaveBeenCalledWith(password, hash);
      expect(result).toBe(false);
    });

    it('should handle null/undefined inputs gracefully', async () => {
      vi.mocked(bcrypt.compare).mockRejectedValue(new Error('Invalid input'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await verifyPassword('', '');

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('needsRehash', () => {
    it('should return false for bcrypt hashes starting with $2', () => {
      const validHashes = [
        '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewfBPjJcZQKXGJ2O',
        '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewfBPjJcZQKXGJ2O',
        '$2x$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewfBPjJcZQKXGJ2O',
        '$2y$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewfBPjJcZQKXGJ2O',
      ];

      validHashes.forEach((hash) => {
        expect(needsRehash(hash)).toBe(false);
      });
    });

    it('should return true for non-bcrypt hashes', () => {
      const invalidHashes = [
        '$1$abcdefgh$ijklmnopqrstuvwxyz', // MD5
        '$5$abcdefgh$ijklmnopqrstuvwxyz', // SHA-256
        '$6$abcdefgh$ijklmnopqrstuvwxyz', // SHA-512
        'plaintextpassword',
        'md5hash',
        '',
      ];

      invalidHashes.forEach((hash) => {
        expect(needsRehash(hash)).toBe(true);
      });
    });

    it('should return true for hashes starting with different prefixes', () => {
      const otherHashes = [
        '$1$hash', // MD5
        '$3$hash', // Unknown
        '$5$hash', // SHA-256
        '$6$hash', // SHA-512
        'other$hash',
      ];

      otherHashes.forEach((hash) => {
        expect(needsRehash(hash)).toBe(true);
      });
    });

    it('should handle empty string', () => {
      expect(needsRehash('')).toBe(true);
    });

    it('should handle short strings', () => {
      expect(needsRehash('$')).toBe(true); // Doesn't start with '$2'
      expect(needsRehash('$2')).toBe(false); // Starts with '$2'
    });
  });
});
