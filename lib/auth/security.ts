import bcrypt from 'bcrypt'
import { validatePasswordStrength } from '@/lib/config/password-policy'

// Enhanced password security
export class PasswordService {
  private static readonly saltRounds = 12
  
  static async hash(password: string): Promise<string> {
    return await bcrypt.hash(password, PasswordService.saltRounds)
  }
  
  static async verify(password: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hash)
    } catch {
      return false
    }
  }
  
  /**
   * Validate password strength using centralized policy
   * ✅ SINGLE SOURCE OF TRUTH: Uses lib/config/password-policy.ts
   */
  static validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
    return validatePasswordStrength(password);
  }
}

// Account lockout system
export class AccountSecurity {
  private static failedAttempts = new Map<string, { count: number; lastAttempt: number; lockedUntil?: number }>()
  private static readonly progressiveLockout = [
    1 * 60 * 1000,  // 1 minute after 3 attempts
    5 * 60 * 1000,  // 5 minutes after 4 attempts
    15 * 60 * 1000  // 15 minutes after 5+ attempts
  ]
  
  static isAccountLocked(identifier: string): { locked: boolean; lockedUntil?: number } {
    const attempts = AccountSecurity.failedAttempts.get(identifier)
    if (!attempts) return { locked: false }
    
    const now = Date.now()
    
    // Check if lockout has expired
    if (attempts.lockedUntil && now > attempts.lockedUntil) {
      AccountSecurity.failedAttempts.delete(identifier)
      return { locked: false }
    }
    
    // Check if account should be locked
    if (attempts.count >= 3 && attempts.lockedUntil) {
      return { locked: true, lockedUntil: attempts.lockedUntil }
    }
    
    return { locked: false }
  }
  
  static recordFailedAttempt(identifier: string): { locked: boolean; lockedUntil?: number } {
    const now = Date.now()
    const existing = AccountSecurity.failedAttempts.get(identifier)
    
    if (!existing) {
      AccountSecurity.failedAttempts.set(identifier, { count: 1, lastAttempt: now })
      return { locked: false }
    }
    
    existing.count++
    existing.lastAttempt = now
    
    // Apply progressive lockout
    if (existing.count >= 3) {
      const lockoutIndex = Math.min(existing.count - 3, AccountSecurity.progressiveLockout.length - 1)
      existing.lockedUntil = now + (AccountSecurity.progressiveLockout[lockoutIndex] || 0)
      return { locked: true, lockedUntil: existing.lockedUntil }
    }
    
    return { locked: false }
  }
  
  static clearFailedAttempts(identifier: string): void {
    AccountSecurity.failedAttempts.delete(identifier)
  }
  
  static getFailedAttemptCount(identifier: string): number {
    return AccountSecurity.failedAttempts.get(identifier)?.count || 0
  }
}

export const verifyPassword = PasswordService.verify
export const hashPassword = PasswordService.hash
