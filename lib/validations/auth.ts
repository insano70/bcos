import { z } from 'zod'
import { passwordSchema, loginPasswordSchema } from '@/lib/config/password-policy'
import { safeEmailSchema, createNameSchema } from './sanitization'

export const loginSchema = z.object({
  email: safeEmailSchema, // ✅ ENHANCED: XSS-safe email validation
  password: loginPasswordSchema, // ✅ CORRECT: Login only validates presence, not strength
  remember: z.union([
    z.boolean(),
    z.string().transform(val => val === 'true' || val === 'on' || val === '1')
  ]).default(false) // Handle form checkbox values
})

export const registerSchema = z.object({
  email: safeEmailSchema, // ✅ ENHANCED: XSS-safe email validation
  password: passwordSchema, // ✅ CENTRALIZED: Uses 12-char policy from single source
  confirmPassword: z.string(),
  firstName: createNameSchema('First name').refine((name: string) => name.length >= 2, 'First name must be at least 2 characters'), // ✅ ENHANCED: XSS-safe name validation
  lastName: createNameSchema('Last name').refine((name: string) => name.length >= 2, 'Last name must be at least 2 characters'), // ✅ ENHANCED: XSS-safe name validation
  acceptTerms: z.boolean().refine(val => val === true, {
    message: 'You must accept the terms and conditions'
  })
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
})

export const passwordResetRequestSchema = z.object({
  email: safeEmailSchema // ✅ ENHANCED: XSS-safe email validation
})

export const passwordResetSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: passwordSchema, // ✅ CENTRALIZED: Uses 12-char policy from single source
  confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
})

export const passwordChangeSchema = z.object({
  currentPassword: loginPasswordSchema, // ✅ CORRECT: Current password only needs presence validation
  newPassword: passwordSchema, // ✅ CENTRALIZED: New password uses 12-char policy from single source
  confirmPassword: z.string()
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
})

// Session validation
export const sessionSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: safeEmailSchema,
    firstName: createNameSchema('First name'),
    lastName: createNameSchema('Last name'),
    role: z.enum(['admin', 'practice_owner']),
    practiceId: z.string().uuid().optional()
  }),
  expires: z.string()
})
