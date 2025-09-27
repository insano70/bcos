import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SignJWT, jwtVerify } from 'jose'
import { nanoid } from 'nanoid'
import { signJWT, verifyJWT, refreshJWT, extractTokenFromRequest } from '@/lib/auth/jwt'
import { logger } from '@/lib/logger'

// Mock dependencies
vi.mock('jose', () => ({
  SignJWT: vi.fn(),
  jwtVerify: vi.fn()
}))

vi.mock('nanoid', () => ({
  nanoid: vi.fn()
}))

vi.mock('@/lib/env', () => ({
  getJWTConfig: vi.fn(() => ({
    accessSecret: 'test-secret-key'
  }))
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn()
  }
}))

describe('JWT authentication logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('signJWT', () => {
    it('should create and sign JWT with correct payload', async () => {
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'admin',
        firstName: 'John',
        lastName: 'Doe'
      }

      const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
      const mockSignJWT = {
        setProtectedHeader: vi.fn().mockReturnThis(),
        setJti: vi.fn().mockReturnThis(),
        setIssuedAt: vi.fn().mockReturnThis(),
        setExpirationTime: vi.fn().mockReturnThis(),
        sign: vi.fn().mockResolvedValue(mockToken)
      }

      vi.mocked(SignJWT).mockReturnValue(mockSignJWT as any)
      vi.mocked(nanoid).mockReturnValue('jti-123')

      const result = await signJWT(payload)

      expect(SignJWT).toHaveBeenCalledWith(payload)
      expect(mockSignJWT.setProtectedHeader).toHaveBeenCalledWith({ alg: 'HS256' })
      expect(mockSignJWT.setJti).toHaveBeenCalledWith('jti-123')
      expect(mockSignJWT.setIssuedAt).toHaveBeenCalled()
      expect(mockSignJWT.setExpirationTime).toHaveBeenCalledWith('24h')
      expect(mockSignJWT.sign).toHaveBeenCalled()
      expect(result).toBe(mockToken)
    })

    it('should handle empty payload', async () => {
      const payload = {}
      const mockToken = 'empty.payload.token'

      const mockSignJWT = {
        setProtectedHeader: vi.fn().mockReturnThis(),
        setJti: vi.fn().mockReturnThis(),
        setIssuedAt: vi.fn().mockReturnThis(),
        setExpirationTime: vi.fn().mockReturnThis(),
        sign: vi.fn().mockResolvedValue(mockToken)
      }

      vi.mocked(SignJWT).mockReturnValue(mockSignJWT as any)
      vi.mocked(nanoid).mockReturnValue('jti-456')

      const result = await signJWT(payload)

      expect(result).toBe(mockToken)
    })

    it('should handle signing errors', async () => {
      const payload = { sub: 'user-123' }
      const error = new Error('Signing failed')

      const mockSignJWT = {
        setProtectedHeader: vi.fn().mockReturnThis(),
        setJti: vi.fn().mockReturnThis(),
        setIssuedAt: vi.fn().mockReturnThis(),
        setExpirationTime: vi.fn().mockReturnThis(),
        sign: vi.fn().mockRejectedValue(error)
      }

      vi.mocked(SignJWT).mockReturnValue(mockSignJWT as any)

      await expect(signJWT(payload)).rejects.toThrow('Signing failed')
    })
  })

  describe('verifyJWT', () => {
    it('should verify and return valid JWT payload', async () => {
      const token = 'valid.jwt.token'
      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'admin',
        iat: 1234567890,
        exp: 1234567890 + 24 * 60 * 60
      }

      vi.mocked(jwtVerify).mockResolvedValue({
        payload: mockPayload,
        protectedHeader: { alg: 'HS256' }
      } as any)

      const result = await verifyJWT(token)

      expect(jwtVerify).toHaveBeenCalledWith(token, expect.any(Uint8Array))
      expect(result).toEqual(mockPayload)
    })

    it('should return null for invalid JWT', async () => {
      const token = 'invalid.jwt.token'
      const error = new Error('Invalid signature')

      vi.mocked(jwtVerify).mockRejectedValue(error)

      const result = await verifyJWT(token)

      expect(logger.error).toHaveBeenCalledWith('JWT verification failed', {
        error: 'Invalid signature',
        stack: error.stack,
        operation: 'verifyJWT'
      })
      expect(result).toBeNull()
    })

    it('should return null for expired JWT', async () => {
      const token = 'expired.jwt.token'
      const error = new Error('Token expired')

      vi.mocked(jwtVerify).mockRejectedValue(error)

      const result = await verifyJWT(token)

      expect(result).toBeNull()
    })

    it('should handle malformed token', async () => {
      const token = 'malformed.token'
      const error = new Error('Malformed token')

      vi.mocked(jwtVerify).mockRejectedValue(error)

      const result = await verifyJWT(token)

      expect(result).toBeNull()
    })

    it('should handle empty token', async () => {
      const token = ''
      const error = new Error('Empty token')

      vi.mocked(jwtVerify).mockRejectedValue(error)

      const result = await verifyJWT(token)

      expect(result).toBeNull()
    })
  })

  describe('refreshJWT', () => {
    it('should refresh valid JWT with new token', async () => {
      const oldToken = 'old.jwt.token'
      const newToken = 'new.jwt.token'
      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'admin',
        firstName: 'John',
        lastName: 'Doe',
        iat: 1234567890,
        exp: 1234567890 + 24 * 60 * 60
      }

      // Mock verifyJWT
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: mockPayload,
        protectedHeader: { alg: 'HS256' }
      } as any)

      // Mock signJWT
      const mockSignJWT = {
        setProtectedHeader: vi.fn().mockReturnThis(),
        setJti: vi.fn().mockReturnThis(),
        setIssuedAt: vi.fn().mockReturnThis(),
        setExpirationTime: vi.fn().mockReturnThis(),
        sign: vi.fn().mockResolvedValue(newToken)
      }
      vi.mocked(SignJWT).mockReturnValue(mockSignJWT as any)

      const result = await refreshJWT(oldToken)

      expect(jwtVerify).toHaveBeenCalledWith(oldToken, expect.any(Uint8Array))
      expect(SignJWT).toHaveBeenCalledWith({
        sub: 'user-123',
        email: 'test@example.com',
        role: 'admin',
        firstName: 'John',
        lastName: 'Doe'
      })
      expect(result).toBe(newToken)
    })

    it('should return null for invalid token during refresh', async () => {
      const oldToken = 'invalid.jwt.token'
      const error = new Error('Invalid token')

      vi.mocked(jwtVerify).mockRejectedValue(error)

      const result = await refreshJWT(oldToken)

      expect(result).toBeNull()
    })

    it('should handle payload without sub field', async () => {
      const oldToken = 'old.jwt.token'
      const newToken = 'new.jwt.token'
      const mockPayload = {
        email: 'test@example.com',
        role: 'user',
        firstName: 'Jane',
        lastName: 'Smith'
      }

      vi.mocked(jwtVerify).mockResolvedValue({
        payload: mockPayload,
        protectedHeader: { alg: 'HS256' }
      } as any)

      const mockSignJWT = {
        setProtectedHeader: vi.fn().mockReturnThis(),
        setJti: vi.fn().mockReturnThis(),
        setIssuedAt: vi.fn().mockReturnThis(),
        setExpirationTime: vi.fn().mockReturnThis(),
        sign: vi.fn().mockResolvedValue(newToken)
      }
      vi.mocked(SignJWT).mockReturnValue(mockSignJWT as any)

      const result = await refreshJWT(oldToken)

      expect(SignJWT).toHaveBeenCalledWith({
        email: 'test@example.com',
        role: 'user',
        firstName: 'Jane',
        lastName: 'Smith'
      })
      expect(result).toBe(newToken)
    })

    it('should return null if signing fails during refresh', async () => {
      const oldToken = 'old.jwt.token'
      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'admin'
      }

      vi.mocked(jwtVerify).mockResolvedValue({
        payload: mockPayload,
        protectedHeader: { alg: 'HS256' }
      } as any)

      const mockSignJWT = {
        setProtectedHeader: vi.fn().mockReturnThis(),
        setJti: vi.fn().mockReturnThis(),
        setIssuedAt: vi.fn().mockReturnThis(),
        setExpirationTime: vi.fn().mockReturnThis(),
        sign: vi.fn().mockRejectedValue(new Error('Signing failed'))
      }
      vi.mocked(SignJWT).mockReturnValue(mockSignJWT as any)

      const result = await refreshJWT(oldToken)

      expect(result).toBeNull()
    })
  })

  describe('extractTokenFromRequest', () => {
    it('should extract token from Authorization header', () => {
      const mockRequest = {
        headers: {
          get: vi.fn().mockReturnValue('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
        }
      } as any

      const result = extractTokenFromRequest(mockRequest)

      expect(mockRequest.headers.get).toHaveBeenCalledWith('Authorization')
      expect(result).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
    })

    it('should return null when no Authorization header', () => {
      const mockRequest = {
        headers: {
          get: vi.fn().mockReturnValue(null)
        }
      } as any

      const result = extractTokenFromRequest(mockRequest)

      expect(result).toBeNull()
    })

    it('should return null when Authorization header doesn\'t start with Bearer', () => {
      const mockRequest = {
        headers: {
          get: vi.fn().mockReturnValue('Basic dXNlcjpwYXNz')
        }
      } as any

      const result = extractTokenFromRequest(mockRequest)

      expect(result).toBeNull()
    })

    it('should return null for empty Authorization header', () => {
      const mockRequest = {
        headers: {
          get: vi.fn().mockReturnValue('')
        }
      } as any

      const result = extractTokenFromRequest(mockRequest)

      expect(result).toBeNull()
    })

    it('should handle malformed Bearer token', () => {
      const mockRequest = {
        headers: {
          get: vi.fn().mockReturnValue('Bearer ')
        }
      } as any

      const result = extractTokenFromRequest(mockRequest)

      expect(result).toBe('')
    })

    it('should handle Bearer token with extra spaces', () => {
      const mockRequest = {
        headers: {
          get: vi.fn().mockReturnValue('Bearer  token123')
        }
      } as any

      const result = extractTokenFromRequest(mockRequest)

      expect(result).toBe(' token123')
    })
  })
})
