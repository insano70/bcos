/**
 * Device Identification Module
 *
 * Pure functions for device fingerprinting and identification.
 * No external dependencies, easily testable.
 *
 * SECURITY:
 * - Device fingerprints used for session tracking and anomaly detection
 * - Consistent hashing ensures same device produces same fingerprint
 * - User-Agent parsing provides human-readable device names for audit trails
 *
 * USAGE:
 * ```typescript
 * import { generateDeviceFingerprint, generateDeviceName } from '@/lib/auth/tokens/device';
 *
 * const fingerprint = generateDeviceFingerprint(ipAddress, userAgent);
 * const deviceName = generateDeviceName(userAgent);
 * ```
 *
 * @module lib/auth/tokens/device
 */

import { createHash } from 'node:crypto';

/**
 * Generate device fingerprint from IP + User-Agent
 *
 * Creates consistent SHA-256 hash for device identification across sessions.
 * Same device (IP + User-Agent) will always produce the same fingerprint.
 *
 * SECURITY:
 * - Used for token binding (prevents token theft)
 * - Enables device-based security policies
 * - Supports anomaly detection (unusual device for user)
 *
 * @param ipAddress - Client IP address (IPv4 or IPv6)
 * @param userAgent - HTTP User-Agent header
 * @returns 32-character hex fingerprint
 *
 * @example
 * const fingerprint = generateDeviceFingerprint('192.168.1.1', 'Mozilla/5.0...');
 * // Returns: "a1b2c3d4e5f6..." (32 chars)
 */
export function generateDeviceFingerprint(ipAddress: string, userAgent: string): string {
  return createHash('sha256').update(`${ipAddress}:${userAgent}`).digest('hex').substring(0, 32);
}

/**
 * Generate human-readable device name from User-Agent
 *
 * Parses User-Agent string to extract browser/device information.
 * Used for audit trails and user-facing session management UI.
 *
 * PATTERN MATCHING ORDER:
 * 1. Edge (must check before Chrome)
 * 2. iPhone (must check before Safari)
 * 3. Android (must check before Chrome)
 * 4. Firefox
 * 5. Chrome (check after Edge/Android to avoid false positives)
 * 6. Safari (check after iPhone to avoid false positives)
 *
 * SECURITY:
 * - Accurate device detection helps users identify sessions
 * - Enables security alerts ("New login from Edge Browser")
 * - Supports device-based access controls
 *
 * @param userAgent - HTTP User-Agent header
 * @returns Human-readable device name
 *
 * @example
 * generateDeviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/120.0.0.0')
 * // Returns: "Edge Browser"
 *
 * generateDeviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15')
 * // Returns: "iPhone Safari"
 */
export function generateDeviceName(userAgent: string): string {
  // Check most specific patterns first to avoid false positives
  // Note: Edge contains "Chrome", iPhone contains "Safari", Android contains "Chrome"

  if (userAgent.includes('Edg/')) return 'Edge Browser'; // Edge uses "Edg/" not "Edge"
  if (userAgent.includes('iPhone')) return 'iPhone Safari';
  if (userAgent.includes('Android')) return 'Android Browser';
  if (userAgent.includes('Firefox')) return 'Firefox Browser';
  if (userAgent.includes('Chrome')) return 'Chrome Browser'; // Check Chrome after Edge/Android
  if (userAgent.includes('Safari')) return 'Safari Browser'; // Check Safari after iPhone

  return 'Unknown Browser';
}
