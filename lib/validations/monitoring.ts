/**
 * Monitoring & Security Admin Validation Schemas
 *
 * Zod schemas for validating monitoring and security administration requests.
 * Used by admin command center endpoints.
 */

import { z } from 'zod';

/**
 * Unlock account request validation
 */
export const unlockAccountSchema = z.object({
  reason: z
    .string()
    .min(10, 'Reason must be at least 10 characters')
    .max(500, 'Reason must be less than 500 characters')
    .trim(),
});

/**
 * Clear failed attempts request validation
 */
export const clearAttemptsSchema = z.object({
  reason: z
    .string()
    .min(10, 'Reason must be at least 10 characters')
    .max(500, 'Reason must be less than 500 characters')
    .trim(),
});

/**
 * Flag/unflag user request validation
 */
export const flagUserSchema = z.object({
  flag: z.boolean(),
  reason: z
    .string()
    .min(10, 'Reason must be at least 10 characters')
    .max(500, 'Reason must be less than 500 characters')
    .trim(),
});

/**
 * Redis purge request validation
 */
export const redisPurgeSchema = z.object({
  pattern: z
    .string()
    .min(1, 'Pattern is required')
    .max(200, 'Pattern must be less than 200 characters')
    .trim(),
  preview: z.boolean().optional().default(false),
  confirm: z.boolean().optional().default(false),
});

/**
 * Redis TTL update request validation
 */
export const redisTTLSchema = z.object({
  pattern: z
    .string()
    .min(1, 'Pattern is required')
    .max(200, 'Pattern must be less than 200 characters')
    .trim(),
  ttl: z
    .number()
    .int('TTL must be an integer')
    .min(-1, 'TTL must be -1 (no expiry) or positive')
    .max(86400 * 30, 'TTL cannot exceed 30 days'),
  preview: z.boolean().optional().default(false),
});
