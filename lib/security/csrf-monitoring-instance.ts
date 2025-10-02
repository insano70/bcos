/**
 * CSRF Security Monitor Singleton Instance
 * Provides a shared instance of CSRFSecurityMonitor for the application
 */

import { db } from '@/lib/db';
import { CSRFSecurityMonitor } from './csrf-monitoring-refactored';

/**
 * Singleton instance of CSRFSecurityMonitor
 * Initialized with the database connection
 */
let csrfMonitorInstance: CSRFSecurityMonitor | null = null;

/**
 * Get the singleton instance of CSRFSecurityMonitor
 * Creates the instance on first call
 */
export function getCSRFMonitor(): CSRFSecurityMonitor {
  if (!csrfMonitorInstance) {
    csrfMonitorInstance = new CSRFSecurityMonitor(db);
  }
  return csrfMonitorInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetCSRFMonitor(): void {
  csrfMonitorInstance = null;
}

// Export the singleton instance for convenience
export const csrfMonitor = getCSRFMonitor();
