import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address').max(255).toLowerCase().trim(),
  password: z.string().min(1, 'Password is required'),
  remember: z.union([
    z.boolean(),
    z.string().transform(val => val === 'true' || val === 'on' || val === '1')
  ]).optional().default(false) // Handle form checkbox values
})

export const registerSchema = z.object({
  email: z.string().email('Please enter a valid email address').max(255).toLowerCase().trim(),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(/^(?=.*[a-z])/, 'Must contain at least one lowercase letter')
    .regex(/^(?=.*[A-Z])/, 'Must contain at least one uppercase letter')
    .regex(/^(?=.*\d)/, 'Must contain at least one number')
    .regex(/^(?=.*[@$!%*?&])/, 'Must contain at least one special character'),
  confirmPassword: z.string(),
  firstName: z.string().min(2, 'First name must be at least 2 characters').max(100).trim(),
  lastName: z.string().min(2, 'Last name must be at least 2 characters').max(100).trim(),
  acceptTerms: z.boolean().refine(val => val === true, {
    message: 'You must accept the terms and conditions'
  })
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
})

export const passwordResetRequestSchema = z.object({
  email: z.string().email('Please enter a valid email address').max(255).toLowerCase().trim()
})

export const passwordResetSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(/^(?=.*[a-z])/, 'Must contain at least one lowercase letter')
    .regex(/^(?=.*[A-Z])/, 'Must contain at least one uppercase letter')
    .regex(/^(?=.*\d)/, 'Must contain at least one number')
    .regex(/^(?=.*[@$!%*?&])/, 'Must contain at least one special character'),
  confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
})

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(/^(?=.*[a-z])/, 'Must contain at least one lowercase letter')
    .regex(/^(?=.*[A-Z])/, 'Must contain at least one uppercase letter')
    .regex(/^(?=.*\d)/, 'Must contain at least one number')
    .regex(/^(?=.*[@$!%*?&])/, 'Must contain at least one special character'),
  confirmPassword: z.string()
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
})

// Session validation
export const sessionSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    firstName: z.string(),
    lastName: z.string(),
    role: z.enum(['admin', 'practice_owner']),
    practiceId: z.string().uuid().optional()
  }),
  expires: z.string()
})
