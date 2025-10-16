/**
 * Timing Tracker Utility
 *
 * Centralized timing management for route handlers.
 * Replaces 15+ scattered Date.now() calls with structured timing tracking.
 *
 * Features:
 * - Track individual operation timings (auth, rate limit, RBAC, handler)
 * - Calculate total request duration
 * - Return structured timing breakdown for logging
 *
 * Usage:
 * ```typescript
 * const tracker = new TimingTracker();
 *
 * const endAuth = tracker.start('auth');
 * await authenticate();
 * endAuth();
 *
 * const duration = tracker.getTotalDuration();
 * const timings = tracker.getTimings();
 * // { auth: 45, rateLimit: 12, handler: 234 }
 * ```
 */

export class TimingTracker {
  private timings: Map<string, number> = new Map();
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Start timing an operation
   *
   * Returns a function to call when operation completes.
   * Uses closure pattern for clean API.
   *
   * @param name - Operation name (e.g., 'auth', 'rbac', 'handler')
   * @returns Function to call when operation completes
   *
   * @example
   * const endTiming = tracker.start('auth');
   * await authenticate();
   * endTiming();
   */
  start(name: string): () => void {
    const opStart = Date.now();
    return () => {
      this.timings.set(name, Date.now() - opStart);
    };
  }

  /**
   * Get total duration since tracker creation
   *
   * @returns Duration in milliseconds
   */
  getTotalDuration(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Get all operation timings as object
   *
   * @returns Record of operation name to duration (ms)
   */
  getTimings(): Record<string, number> {
    return Object.fromEntries(this.timings);
  }

  /**
   * Get timing for specific operation
   *
   * @param name - Operation name
   * @returns Duration in milliseconds, or undefined if not tracked
   */
  getTiming(name: string): number | undefined {
    return this.timings.get(name);
  }

  /**
   * Reset all timings (keeps start time)
   *
   * Useful if reusing tracker across operations.
   */
  reset(): void {
    this.timings.clear();
  }
}
