/**
 * Mock CSRF Security Monitor for Testing
 * Provides an in-memory implementation for tests without requiring database
 */

import type { NextRequest } from 'next/server';
import type { CSRFSeverity, FailureStats } from '@/lib/security/csrf-monitoring-refactored';

interface FailureEvent {
  timestamp: Date;
  ip: string;
  userAgent: string;
  pathname: string;
  reason: string;
  severity: CSRFSeverity;
  userId?: string | undefined;
}

/**
 * Mock CSRF Security Monitor
 * Stores events in memory for testing purposes
 */
export class MockCSRFSecurityMonitor {
  private events: FailureEvent[] = [];

  /**
   * Record a CSRF validation failure
   */
  async recordFailure(
    request: NextRequest,
    reason: string,
    severity: CSRFSeverity = 'medium',
    userId?: string
  ): Promise<void> {
    const ip = this.extractIP(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const pathname = request.nextUrl.pathname;

    this.events.push({
      timestamp: new Date(),
      ip,
      userAgent,
      pathname,
      reason,
      severity,
      userId,
    });
  }

  /**
   * Extract IP address from request
   */
  private extractIP(request: NextRequest): string {
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
      const firstIP = forwardedFor.split(',')[0];
      return firstIP ? firstIP.trim() : 'unknown';
    }
    return request.headers.get('x-real-ip') || request.headers.get('cf-connecting-ip') || 'unknown';
  }

  /**
   * Get current failure statistics
   */
  async getFailureStats(): Promise<FailureStats> {
    const now = new Date();
    const oneHour = new Date(now.getTime() - 60 * 60 * 1000);

    // Count recent events
    const recentEvents = this.events.filter((e) => e.timestamp > oneHour).length;

    // Group by IP
    const ipMap = new Map<string, { count: number; latestFailure: Date }>();
    for (const event of this.events) {
      const existing = ipMap.get(event.ip);
      if (existing) {
        existing.count++;
        if (event.timestamp > existing.latestFailure) {
          existing.latestFailure = event.timestamp;
        }
      } else {
        ipMap.set(event.ip, { count: 1, latestFailure: event.timestamp });
      }
    }

    // Convert to array and sort
    const topIPs = Array.from(ipMap.entries())
      .map(([ip, stats]) => ({
        ip,
        count: stats.count,
        latestFailure: stats.latestFailure,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalIPs: ipMap.size,
      totalEvents: this.events.length,
      recentEvents,
      topIPs,
    };
  }

  /**
   * Clean up old events
   */
  async cleanupOldEvents(retentionHours: number = 24): Promise<number> {
    const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000);
    const initialLength = this.events.length;
    this.events = this.events.filter((e) => e.timestamp > cutoff);
    return initialLength - this.events.length;
  }

  /**
   * Clear all failure data (for testing)
   */
  async clearAllEvents(): Promise<number> {
    const count = this.events.length;
    this.events = [];
    return count;
  }
}

// Create a singleton mock instance for tests
let mockInstance: MockCSRFSecurityMonitor | null = null;

/**
 * Get the mock CSRF monitor instance
 */
export function getMockCSRFMonitor(): MockCSRFSecurityMonitor {
  if (!mockInstance) {
    mockInstance = new MockCSRFSecurityMonitor();
  }
  return mockInstance;
}

/**
 * Reset the mock instance
 */
export function resetMockCSRFMonitor(): void {
  mockInstance = null;
}
