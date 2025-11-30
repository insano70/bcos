/**
 * OIDC State Manager
 *
 * CRITICAL SECURITY COMPONENT
 *
 * Manages one-time use validation for OIDC state tokens to prevent replay attacks.
 * This is a requirement of the OIDC specification (RFC 6749) - state tokens MUST
 * be single-use to prevent CSRF attacks.
 *
 * Features:
 * - One-time use enforcement (state marked as used after first validation)
 * - Automatic expiration (5 minutes + 30s clock skew tolerance)
 * - Automatic cleanup to prevent memory leaks
 * - Thread-safe operations (singleton pattern)
 *
 * For distributed systems (multiple servers), replace in-memory Map with Redis
 * using atomic operations (SET NX with TTL).
 *
 * @module lib/oidc/state-manager
 * @security CRITICAL - Prevents CSRF and replay attacks
 */

import { log } from '@/lib/logger';
import type { StateData } from './types';

/**
 * Global type augmentation for state persistence
 */
declare global {
  // eslint-disable-next-line no-var
  var __oidcStateManager: Map<string, StateData> | undefined;
}

/**
 * State Manager Class
 *
 * Singleton class managing state token lifecycle with one-time use validation.
 *
 * IMPORTANT: In development, Next.js hot module reloading can destroy the singleton.
 * We use globalThis to persist state across module reloads to prevent state loss
 * when routes are compiled on-demand.
 */
class StateManager {
  private states: Map<string, StateData>;

  // State TTL: 5 minutes + 30 seconds clock skew tolerance
  private readonly STATE_TTL = 5 * 60 * 1000 + 30 * 1000;

  // Cleanup TTL: Keep used states for 10 minutes for audit logging
  private readonly CLEANUP_TTL = 10 * 60 * 1000;

  constructor() {
    // Use globalThis to persist state across Next.js hot reloads in development
    // This prevents state loss when routes are compiled on-demand
    if (!globalThis.__oidcStateManager) {
      globalThis.__oidcStateManager = new Map<string, StateData>();
      log.debug('State manager initialized with new Map');
    }
    this.states = globalThis.__oidcStateManager;
  }

  /**
   * Register State Token
   *
   * Registers a new state token for one-time use validation.
   * Called during OIDC login initiation.
   *
   * @param state - State token to register
   */
  registerState(state: string): void {
    if (!state || state.length === 0) {
      log.error('Attempted to register empty state token', new Error('Empty state token'), {
        operation: 'register_oidc_state',
        component: 'auth',
      });
      throw new Error('Invalid state token');
    }

    this.states.set(state, {
      timestamp: Date.now(),
      used: false,
    });

    log.debug('State token registered', {
      state: `${state.substring(0, 8)}...`,
      totalStates: this.states.size,
    });
  }

  /**
   * Validate and Mark Used
   *
   * Validates a state token and marks it as used if valid.
   * This enforces ONE-TIME USE - a state can only be validated once.
   *
   * Returns:
   * - true: State is valid and has been marked as used
   * - false: State is invalid, expired, or already used
   *
   * @param state - State token to validate
   * @returns true if valid and unused, false otherwise
   */
  validateAndMarkUsed(state: string): boolean {
    const data = this.states.get(state);

    // State not found
    if (!data) {
      log.warn('State token not found (expired or never registered)', {
        state: `${state.substring(0, 8)}...`,
      });
      return false;
    }

    // State already used (REPLAY ATTACK DETECTED)
    if (data.used) {
      log.error('State token replay attempt detected', {
        state: `${state.substring(0, 8)}...`,
        originalTimestamp: new Date(data.timestamp).toISOString(),
        age: Date.now() - data.timestamp,
      });
      return false;
    }

    // Check state age (5 minutes + 30s clock skew)
    const age = Date.now() - data.timestamp;
    if (age > this.STATE_TTL) {
      log.warn('State token expired', {
        state: `${state.substring(0, 8)}...`,
        age,
        maxAge: this.STATE_TTL,
      });
      this.states.delete(state);
      return false;
    }

    // Mark as used (CRITICAL: Prevents replay)
    data.used = true;

    log.info('State token validated and marked as used', {
      state: `${state.substring(0, 8)}...`,
      age,
    });

    // Schedule cleanup after CLEANUP_TTL
    setTimeout(() => {
      this.states.delete(state);
      log.debug('State token cleaned up', {
        state: `${state.substring(0, 8)}...`,
      });
    }, this.CLEANUP_TTL);

    return true;
  }

  /**
   * Clear All States
   *
   * Clears all registered states. Use for testing or maintenance.
   * DO NOT use in production except for explicit cleanup scenarios.
   */
  clearAll(): void {
    const count = this.states.size;
    this.states.clear();
    log.warn('All state tokens cleared', { count });
  }

  /**
   * Get State Count
   *
   * Returns the number of currently tracked states.
   * Useful for monitoring and debugging.
   */
  getStateCount(): number {
    return this.states.size;
  }

  /**
   * Cleanup Expired States
   *
   * Manually trigger cleanup of expired unused states.
   * This is called automatically via setTimeout, but can be triggered
   * manually for testing or maintenance.
   */
  cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    // Convert to array first to avoid iteration issues
    const entries = Array.from(this.states.entries());

    for (const [state, data] of entries) {
      const age = now - data.timestamp;

      // Remove expired unused states
      if (!data.used && age > this.STATE_TTL) {
        this.states.delete(state);
        cleaned++;
      }

      // Remove old used states
      if (data.used && age > this.CLEANUP_TTL) {
        this.states.delete(state);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log.info('Expired states cleaned up', { cleaned, remaining: this.states.size });
    }

    return cleaned;
  }
}

// Export singleton instance
export const stateManager = new StateManager();
