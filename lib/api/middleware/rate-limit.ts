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
    limit: 300, // 300 file uploads per minute
    windowSeconds: 60, // 1 minute
    // Rationale: Prevents storage/bandwidth abuse from bulk uploads
    // 300/min allows extensive batch operations and large gallery uploads while blocking DoS via large files
  },
  api: {
    limit: 500, // 500 standard API requests per minute
    windowSeconds: 60, // 1 minute
    // Rationale: Supports complex dashboard usage (8+ requests/second)
    // High enough for complex UIs with multiple concurrent requests, low enough to prevent abuse
  },
  session_read: {
    limit: 500, // 500 session verification requests per minute
    windowSeconds: 60, // 1 minute
    // Rationale: High limit for frequent auth checks (/api/auth/me called 3+ times per page)
    // Must be higher than 'api' to avoid blocking legitimate session verification
  },
  admin_cli: {
    limit: 1, // 1 request per minute
    windowSeconds: 60, // 1 minute
    // Rationale: Resource-intensive admin operations (e.g., report card generation)
    // Should be heavily rate limited to prevent system overload
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
 * Extract a stable identifier for rate limiting.
 * Prefers Next.js' connection-level IP (non-spoofable) and falls back to
 * infrastructurally populated headers when running outside the NextRequest context.
 */
type RequestWithIp = Request & { ip?: string | null };

export function getRateLimitKey(request: Request, prefix = ''): string {
  const requestWithIp = request as RequestWithIp;
  const ipFromRuntime =
    typeof requestWithIp.ip === 'string' && requestWithIp.ip.length > 0
      ? requestWithIp.ip
      : null;

  const fallbackIp =
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('true-client-ip') ||
    request.headers.get('x-client-ip');

  const ip = ipFromRuntime || fallbackIp || 'anonymous';
  return prefix ? `${prefix}:${ip}` : ip;
}

/**
 * Apply Redis-based rate limiting
 * Multi-instance safe - rate limits enforced globally across all instances
 *
 * @param request - HTTP request
 * @param type - Rate limit type (auth, api, upload, mfa, session_read, admin_cli)
 * @returns Rate limit result with remaining count and reset time
 * @throws RateLimitError if rate limit exceeded
 */
export async function applyRateLimit(
  request: Request,
  type: 'auth' | 'api' | 'upload' | 'mfa' | 'session_read' | 'admin_cli' = 'api'
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

  // Get identifier (IP address + rate limit type to avoid key collision)
  // Different rate limit types must have separate counters
  const ip = getRateLimitKey(request);
  const identifier = `${type}:${ip}`;
  // Pre-compute redacted identifier for logging (redact IP first, then add type prefix)
  // This preserves the type info while properly redacting the IP address
  const redactedIdentifier = `${type}:${redactIpForLogging(ip)}`;

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
      identifier: redactedIdentifier,
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
      identifier: redactedIdentifier,
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
