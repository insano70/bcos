import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentUserFromToken } from '@/lib/auth/session';
import { validateAccessToken } from '@/lib/auth/tokens';

// Use standardized mock pattern based on mock utilities design
vi.mock('@/lib/auth/tokens', () => ({
  validateAccessToken: vi.fn().mockResolvedValue({ sub: 'user-123', jti: 'jti-123' }),
}));

vi.mock('@/lib/db', () => {
  // Standardized database mock with method chaining
  const mockSelectResult = vi.fn().mockResolvedValue([]);

  return {
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: mockSelectResult,
          }),
        }),
      }),
    },
    users: {
      user_id: 'user_id',
      email: 'email',
      first_name: 'first_name',
      last_name: 'last_name',
      is_active: 'is_active',
      email_verified: 'email_verified',
    },
    // Export mock helpers for test access
    _mockSelectResult: mockSelectResult,
  };
});

describe('session authentication logic', () => {
  // Let TypeScript infer the complex mocked types from vitest
  let mockValidateAccessToken: ReturnType<typeof vi.mocked<typeof import('@/lib/auth/tokens').validateAccessToken>>;
  let _mockDb: ReturnType<typeof vi.mocked<typeof import('@/lib/db').db>>;
  let mockSelectResult: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get references to the standardized mocks
    const tokenManagerModule = await import('@/lib/auth/tokens');
    mockValidateAccessToken = vi.mocked(tokenManagerModule.validateAccessToken);

    const dbModule = await import('@/lib/db');
    _mockDb = vi.mocked(dbModule.db);
    mockSelectResult = (dbModule as Record<string, unknown>)._mockSelectResult as ReturnType<typeof vi.fn>;
  });

  describe('getCurrentUserFromToken', () => {
    it('should return user data for valid token and active user', async () => {
      const mockToken = 'valid.jwt.token';
      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'admin',
        firstName: 'John',
        lastName: 'Doe',
      };
      const mockUser = {
        user_id: 'user-123',
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        is_active: true,
        email_verified: true,
      };

      mockValidateAccessToken.mockResolvedValue(mockPayload);
      mockSelectResult.mockResolvedValue([mockUser]);

      const result = await getCurrentUserFromToken(mockToken);

      expect(validateAccessToken).toHaveBeenCalledWith(mockToken);
      expect(result).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        name: 'John Doe',
        firstName: 'John',
        lastName: 'Doe',
        role: 'admin',
        emailVerified: true,
        practiceId: undefined,
      });
    });

    it('should return null for invalid token', async () => {
      const mockToken = 'invalid.jwt.token';

      mockValidateAccessToken.mockResolvedValue(null);

      const result = await getCurrentUserFromToken(mockToken);

      expect(validateAccessToken).toHaveBeenCalledWith(mockToken);
      expect(result).toBeNull();
    });

    it('should return null for inactive user', async () => {
      const mockToken = 'valid.jwt.token';
      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'admin',
      };
      const mockUser = {
        user_id: 'user-123',
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        is_active: false,
        email_verified: true,
      };

      mockValidateAccessToken.mockResolvedValue(mockPayload);
      mockSelectResult.mockResolvedValue([mockUser]);

      const result = await getCurrentUserFromToken(mockToken);

      expect(result).toBeNull();
    });

    it('should return null when user not found', async () => {
      const mockToken = 'valid.jwt.token';
      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'admin',
      };

      mockValidateAccessToken.mockResolvedValue(mockPayload);
      mockSelectResult.mockResolvedValue([]); // No user found

      const result = await getCurrentUserFromToken(mockToken);

      expect(result).toBeNull();
    });

    it('should return null when token validation throws', async () => {
      const mockToken = 'malformed.jwt.token';

      mockValidateAccessToken.mockRejectedValue(new Error('Invalid token'));

      const result = await getCurrentUserFromToken(mockToken);

      expect(result).toBeNull();
    });

    it('should handle payload without sub field', async () => {
      const mockToken = 'token.without.sub';
      const mockPayload = {
        email: 'test@example.com',
        role: 'admin',
        // Missing sub field
      };

      mockValidateAccessToken.mockResolvedValue(mockPayload);

      const result = await getCurrentUserFromToken(mockToken);

      expect(result).toBeNull();
    });

    it('should handle database query errors gracefully', async () => {
      const mockToken = 'valid.jwt.token';
      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'admin',
      };

      mockValidateAccessToken.mockResolvedValue(mockPayload);
      // Mock database error
      mockSelectResult.mockRejectedValue(new Error('Database connection failed'));

      const result = await getCurrentUserFromToken(mockToken);

      expect(result).toBeNull();
    });

    it('should return user with unverified email', async () => {
      const mockToken = 'valid.jwt.token';
      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'admin',
      };
      const mockUser = {
        user_id: 'user-123',
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        is_active: true,
        email_verified: false,
      };

      mockValidateAccessToken.mockResolvedValue(mockPayload);
      mockSelectResult.mockResolvedValue([mockUser]);

      const result = await getCurrentUserFromToken(mockToken);

      expect(result).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        name: 'John Doe',
        firstName: 'John',
        lastName: 'Doe',
        role: 'admin',
        emailVerified: false,
        practiceId: undefined,
      });
    });
  });
});
