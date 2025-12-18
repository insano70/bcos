import { z } from 'zod';

/**
 * Admin Cache, Redis, and Security Validation Schemas
 *
 * Zod schemas for validating admin cache, Redis management, and security API requests.
 */

// Cache Invalidation
export const cacheInvalidateSchema = z.object({
  datasourceId: z.number().int().positive().optional(),
  reason: z.string().max(500).optional(),
});

export type CacheInvalidateRequest = z.infer<typeof cacheInvalidateSchema>;

// Redis FLUSHALL
export const redisFlushAllSchema = z.object({
  confirm: z.literal(true, 'Confirmation required: POST body must include {"confirm": true}'),
});

export type RedisFlushAllRequest = z.infer<typeof redisFlushAllSchema>;

// Redis Purge
export const redisPurgeSchema = z.object({
  pattern: z.string().min(1, 'pattern field is required').max(200),
  preview: z.boolean().optional().default(false),
  confirm: z.boolean().optional().default(false),
});

export type RedisPurgeRequest = z.infer<typeof redisPurgeSchema>;

// Redis TTL Update
export const redisTTLUpdateSchema = z.object({
  pattern: z.string().min(1, 'pattern field is required').max(200),
  ttl: z.number().int({ message: 'ttl field must be a number' }),
  preview: z.boolean().optional().default(false),
});

export type RedisTTLUpdateRequest = z.infer<typeof redisTTLUpdateSchema>;

// CSP Violation Report (from browser)
const cspReportDetailsSchema = z.object({
  'document-uri': z.string().optional(),
  'violated-directive': z.string().optional(),
  'blocked-uri': z.string().optional(),
  'source-file': z.string().optional(),
  'line-number': z.number().optional(),
  'column-number': z.number().optional(),
  'status-code': z.number().optional(),
  referrer: z.string().optional(),
  'script-sample': z.string().optional(),
});

export const cspViolationReportSchema = z.object({
  'csp-report': cspReportDetailsSchema.optional(),
}).passthrough(); // Allow additional fields since browsers may vary

export type CSPViolationReport = z.infer<typeof cspViolationReportSchema>;
