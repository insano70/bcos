import bcrypt from 'bcrypt'

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
  
  static validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = []
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long')
    }
    if (password.length > 128) {
      errors.push('Password must not exceed 128 characters')
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter')
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter')
    }
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number')
    }
    if (!/[@$!%*?&]/.test(password)) {
      errors.push('Password must contain at least one special character (@$!%*?&)')
    }
    
    return { isValid: errors.length === 0, errors }
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
    const attempts = this.failedAttempts.get(identifier)
    if (!attempts) return { locked: false }
    
    const now = Date.now()
    
    // Check if lockout has expired
    if (attempts.lockedUntil && now > attempts.lockedUntil) {
      this.failedAttempts.delete(identifier)
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
    const existing = this.failedAttempts.get(identifier)
    
    if (!existing) {
      this.failedAttempts.set(identifier, { count: 1, lastAttempt: now })
      return { locked: false }
    }
    
    existing.count++
    existing.lastAttempt = now
    
    // Apply progressive lockout
    if (existing.count >= 3) {
      const lockoutIndex = Math.min(existing.count - 3, this.progressiveLockout.length - 1)
      existing.lockedUntil = now + this.progressiveLockout[lockoutIndex]
      return { locked: true, lockedUntil: existing.lockedUntil }
    }
    
    return { locked: false }
  }
  
  static clearFailedAttempts(identifier: string): void {
    this.failedAttempts.delete(identifier)
  }
  
  static getFailedAttemptCount(identifier: string): number {
    return this.failedAttempts.get(identifier)?.count || 0
  }
}

export const verifyPassword = PasswordService.verify
export const hashPassword = PasswordService.hash
