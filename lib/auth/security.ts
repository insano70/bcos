import bcrypt from 'bcrypt'
import { validatePasswordStrength } from '@/lib/config/password-policy'
import { db, account_security, users } from '@/lib/db'
import { eq, lt } from 'drizzle-orm'

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

// Account lockout system with database persistence
export class AccountSecurity {
  private static readonly progressiveLockout = [
    1 * 60 * 1000,  // 1 minute after 3 attempts
    5 * 60 * 1000,  // 5 minutes after 4 attempts
    15 * 60 * 1000  // 15 minutes after 5+ attempts
  ]
  
  static async isAccountLocked(identifier: string): Promise<{ locked: boolean; lockedUntil?: number }> {
    try {
      // For login attempts, the identifier is the email, but we need to find the user_id first
      // Get user by email to find user_id
      const [user] = await db
        .select({ user_id: users.user_id })
        .from(users)
        .where(eq(users.email, identifier))
        .limit(1)
      
      if (!user) {
        return { locked: false }
      }
      
      // Get current security record from database using user_id
      const [securityRecord] = await db
        .select()
        .from(account_security)
        .where(eq(account_security.user_id, user.user_id))
        .limit(1)

      if (!securityRecord) {
        return { locked: false }
      }
      
      const now = new Date()
      
      // Check if lockout has expired
      if (securityRecord.locked_until && now > securityRecord.locked_until) {
        // Clear expired lockout
        await db
          .update(account_security)
          .set({ 
            locked_until: null, 
            suspicious_activity_detected: false 
          })
          .where(eq(account_security.user_id, user.user_id))
        return { locked: false }
      }
      
      // Check if account is currently locked
      if (securityRecord.failed_login_attempts >= 3 && securityRecord.locked_until && now <= securityRecord.locked_until) {
        return { locked: true, lockedUntil: securityRecord.locked_until.getTime() }
      }
      
      return { locked: false }
    } catch (error) {
      console.error('Error checking account lockout status:', error)
      return { locked: false } // Fail open on database errors
    }
  }
  
  static async recordFailedAttempt(identifier: string): Promise<{ locked: boolean; lockedUntil?: number }> {
    try {
      const now = new Date()
      
      // Get user by email to find user_id
      const [user] = await db
        .select({ user_id: users.user_id })
        .from(users)
        .where(eq(users.email, identifier))
        .limit(1)
      
      if (!user) {
        // User doesn't exist, but still return as if we recorded the attempt for security
        return { locked: false }
      }
      
      // Get or create security record
      const [existing] = await db
        .select()
        .from(account_security)
        .where(eq(account_security.user_id, user.user_id))
        .limit(1)
      
      let failedAttempts = 1
      let lockedUntil: Date | null = null
      
      if (existing) {
        // Update existing record
        failedAttempts = existing.failed_login_attempts + 1
        
        // Apply progressive lockout
        if (failedAttempts >= 3) {
          const lockoutIndex = Math.min(failedAttempts - 3, AccountSecurity.progressiveLockout.length - 1)
          const lockoutDuration = AccountSecurity.progressiveLockout[lockoutIndex] || 0
          lockedUntil = new Date(now.getTime() + lockoutDuration)
        }
        
        await db
          .update(account_security)
          .set({
            failed_login_attempts: failedAttempts,
            last_failed_attempt: now,
            locked_until: lockedUntil,
            suspicious_activity_detected: failedAttempts >= 3
          })
          .where(eq(account_security.user_id, user.user_id))
      } else {
        // Create new security record
        await db
          .insert(account_security)
          .values({
            user_id: user.user_id,
            failed_login_attempts: failedAttempts,
            last_failed_attempt: now,
            locked_until: lockedUntil,
            suspicious_activity_detected: false
          })
      }
      
      const isLocked = lockedUntil !== null && now <= lockedUntil
      const result: { locked: boolean; lockedUntil?: number } = { locked: isLocked }
      if (lockedUntil) {
        result.lockedUntil = lockedUntil.getTime()
      }
      return result
    } catch (error) {
      console.error('Error recording failed attempt:', error)
      return { locked: false } // Fail open on database errors
    }
  }
  
  static async clearFailedAttempts(identifier: string): Promise<void> {
    try {
      // Get user by email to find user_id
      const [user] = await db
        .select({ user_id: users.user_id })
        .from(users)
        .where(eq(users.email, identifier))
        .limit(1)
      
      if (!user) {
        return // User doesn't exist, nothing to clear
      }
      
      await db
        .update(account_security)
        .set({
          failed_login_attempts: 0,
          last_failed_attempt: null,
          locked_until: null,
          suspicious_activity_detected: false
        })
        .where(eq(account_security.user_id, user.user_id))
    } catch (error) {
      console.error('Error clearing failed attempts:', error)
    }
  }
  
  static async getFailedAttemptCount(identifier: string): Promise<number> {
    try {
      // Get user by email to find user_id
      const [user] = await db
        .select({ user_id: users.user_id })
        .from(users)
        .where(eq(users.email, identifier))
        .limit(1)
      
      if (!user) {
        return 0 // User doesn't exist
      }
      
      const [securityRecord] = await db
        .select({ failedAttempts: account_security.failed_login_attempts })
        .from(account_security)
        .where(eq(account_security.user_id, user.user_id))
        .limit(1)
      
      return securityRecord?.failedAttempts || 0
    } catch (error) {
      console.error('Error getting failed attempt count:', error)
      return 0
    }
  }
  
  /**
   * Clean up expired lockout records
   */
  static async cleanupExpiredLockouts(): Promise<number> {
    try {
      const now = new Date()
      // Update expired lockouts instead of deleting records
      const result = await db
        .update(account_security)
        .set({
          locked_until: null,
          suspicious_activity_detected: false
        })
        .where(lt(account_security.locked_until, now))
      
      return Array.isArray(result) ? result.length : 0
    } catch (error) {
      console.error('Error cleaning up expired lockouts:', error)
      return 0
    }
  }
}

export const verifyPassword = PasswordService.verify
export const hashPassword = PasswordService.hash
