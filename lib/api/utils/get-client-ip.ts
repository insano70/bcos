/**
 * Get Client IP Address Utility
 *
 * Safely extracts the client's IP address from request headers.
 * Prevents IP spoofing by only trusting the first IP in x-forwarded-for
 * when behind a trusted proxy/load balancer.
 *
 * @example
 * ```typescript
 * const ipAddress = getClientIP(request);
 * // Use in audit logs
 * AuditLogger.logUserAction({
 *   action: 'user_updated',
 *   userId: user.id,
 *   ipAddress,
 * });
 * ```
 */

import type { NextRequest } from 'next/server';

/**
 * Extract client IP address from request headers
 *
 * Priority order:
 * 1. x-forwarded-for (first IP only, to prevent spoofing)
 * 2. x-real-ip
 * 3. 'unknown' fallback
 *
 * @param request - Next.js request object
 * @returns Client IP address or 'unknown' if not available
 *
 * @security
 * Only the FIRST IP in x-forwarded-for is trusted. This assumes:
 * - Application is behind a trusted proxy/load balancer (AWS ALB, nginx, etc.)
 * - The proxy appends the real client IP to the beginning of x-forwarded-for
 * - Subsequent IPs in the chain may be spoofed by the client
 *
 * @example
 * ```typescript
 * // Behind AWS ALB:
 * // x-forwarded-for: "203.0.113.45, 192.0.2.1, 198.51.100.42"
 * // Returns: "203.0.113.45" (real client IP)
 *
 * const ip = getClientIP(request);
 * console.log(ip); // "203.0.113.45"
 * ```
 */
export function getClientIP(request: NextRequest): string {
  // Check x-forwarded-for header (most common when behind proxy)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // Take only the FIRST IP to prevent client spoofing
    // Format: "client-ip, proxy1-ip, proxy2-ip"
    const firstIP = forwarded.split(',')[0]?.trim();
    if (firstIP) {
      return firstIP;
    }
  }

  // Fallback to x-real-ip (nginx, Cloudflare)
  const realIP = request.headers.get('x-real-ip')?.trim();
  if (realIP) {
    return realIP;
  }

  // If no headers available, return unknown
  return 'unknown';
}
