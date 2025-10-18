import { type RateLimitResult, rateLimitCache } from '@/lib/cache';
import { log } from '@/lib/logger';
import { RateLimitError } from '../responses/error';

/**
 * Rate limit configuration
 */
interface RateLimitConfig {
  limit: number;
  windowSeconds: number;
}

/**
 * Rate limit configurations by type
 * Centralized configuration for easy adjustment
 *
 * Design Philosophy:
 * - Fail-safe: Prevent abuse while allowing legitimate usage
 * - User-friendly: Limits high enough for normal workflows
 * - Security-first: Aggressive limits on authentication endpoints
 */
const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  auth: {
    limit: 20, // 20 auth attempts per 15-minute window
    windowSeconds: 15 * 60, // 15 minutes
    // Rationale: Allows 1-2 failed login attempts + retries before lockout
    // Prevents brute force attacks while accommodating typos/forgotten passwords
  },
  mfa: {
    limit: 5, // 5 MFA verification attempts per 15-minute window
    windowSeconds: 15 * 60, // 15 minutes
    // Rationale: Strict limit to prevent TOTP/passkey brute force
    // Lower than 'auth' because MFA should succeed on first try
  },
  upload: {
    limit: 10, // 10 file uploads per minute
    windowSeconds: 60, // 1 minute
    // Rationale: Prevents storage/bandwidth abuse from bulk uploads
    // 10/min allows batch operations while blocking DoS via large files
  },
  api: {
    limit: 200, // 200 standard API requests per minute
    windowSeconds: 60, // 1 minute
    // Rationale: Supports typical dashboard usage (3-4 requests/second)
    // High enough for complex UIs, low enough to prevent abuse
  },
  session_read: {
    limit: 500, // 500 session verification requests per minute
    windowSeconds: 60, // 1 minute
    // Rationale: High limit for frequent auth checks (/api/auth/me called 3+ times per page)
    // Must be higher than 'api' to avoid blocking legitimate session verification
  },
};

/**
 * Redact IP address for privacy-compliant logging
 * Keeps first two octets for debugging while protecting PII
 *
 * @param ip - IP address to redact
 * @returns Redacted IP (e.g., "192.168.xxx.xxx")
 */
function redactIpForLogging(ip: string): string {
  if (ip === 'anonymous') {
    return 'anonymous';
  }

  // IPv4: Keep first two octets
  const ipv4Match = ip.match(/^(\d{1,3}\.\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (ipv4Match) {
    return `${ipv4Match[1]}.xxx.xxx`;
  }

  // IPv6: Keep first two segments
  const ipv6Match = ip.match(/^([0-9a-f]{1,4}:[0-9a-f]{1,4}):/i);
  if (ipv6Match) {
    return `${ipv6Match[1]}:xxxx:xxxx:xxxx:xxxx:xxxx`;
  }

  // Fallback for unknown format
  return '[REDACTED]';
}

/**
 * Extract IP address from request
 * Checks x-forwarded-for and x-real-ip headers first
 */
export function getRateLimitKey(request: Request, prefix = ''): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const firstIp = forwardedFor ? forwardedFor.split(',')[0] : null;
  const trimmedIp = firstIp ? firstIp.trim() : null;
  const ip = trimmedIp || request.headers.get('x-real-ip') || 'anonymous';
  return prefix ? `${prefix}:${ip}` : ip;
}

/**
 * Apply Redis-based rate limiting
 * Multi-instance safe - rate limits enforced globally across all instances
 *
 * @param request - HTTP request
 * @param type - Rate limit type (auth, api, upload, mfa, session_read)
 * @returns Rate limit result with remaining count and reset time
 * @throws RateLimitError if rate limit exceeded
 */
export async function applyRateLimit(
  request: Request,
  type: 'auth' | 'api' | 'upload' | 'mfa' | 'session_read' = 'api'
): Promise<{
  success: boolean;
  remaining: number;
  resetTime: number;
  limit: number;
  windowMs: number;
}> {
  // Get rate limit config
  const config = RATE_LIMIT_CONFIGS[type];
  if (!config) {
    log.error(
      'Unknown rate limit type, falling back to api',
      new Error('Unknown rate limit type'),
      {
        type,
        fallbackType: 'api',
      }
    );
    return applyRateLimit(request, 'api');
  }

  // Get identifier (IP address)
  const identifier = getRateLimitKey(request);

  // Check rate limit using Redis
  const result: RateLimitResult = await rateLimitCache.checkIpRateLimit(
    identifier,
    config.limit,
    config.windowSeconds
  );

  // Log rate limit enforcement
  if (!result.allowed) {
    log.security('rate_limit_exceeded', 'medium', {
      action: 'rate_limit_block',
      threat: 'dos_attempt',
      blocked: true,
      type,
      identifier: redactIpForLogging(identifier),
      current: result.current,
      limit: result.limit,
      resetAt: result.resetAt,
    });

    const error = RateLimitError(result.resetTime);
    error.details = {
      limit: result.limit,
      windowMs: config.windowSeconds * 1000,
      resetTime: result.resetTime,
      retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
      type,
    };
    throw error;
  }

  // Debug log for successful rate limit checks (only in development)
  if (process.env.NODE_ENV === 'development') {
    log.debug('Rate limit check passed', {
      type,
      identifier: redactIpForLogging(identifier),
      current: result.current,
      remaining: result.remaining,
      limit: result.limit,
    });
  }

  return {
    success: result.allowed,
    remaining: result.remaining,
    resetTime: result.resetTime,
    limit: result.limit,
    windowMs: config.windowSeconds * 1000,
  };
}

export function addRateLimitHeaders(
  response: Response,
  result: { remaining: number; resetTime: number; limit?: number; windowMs?: number }
): void {
  response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
  response.headers.set('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000).toString());

  if (result.limit !== undefined) {
    response.headers.set('X-RateLimit-Limit', result.limit.toString());
  }

  if (result.windowMs !== undefined) {
    response.headers.set('X-RateLimit-Window', Math.ceil(result.windowMs / 1000).toString());
  }

  response.headers.set('X-RateLimit-Policy', 'sliding-window');

  // Add retry-after header if rate limited
  if (result.remaining === 0) {
    const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
    response.headers.set('Retry-After', Math.max(1, retryAfter).toString());
  }
}
