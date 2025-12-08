import { and, eq } from 'drizzle-orm';
import { dashboards, db } from '@/lib/db';
import { log } from '@/lib/logger';

/**
 * Get the default dashboard ID
 * Returns the dashboard ID of the default dashboard, or null if none is set
 * Used by login flow to redirect users to the default dashboard
 */
export async function getDefaultDashboardId(): Promise<string | null> {
  try {
    const [defaultDashboard] = await db
      .select({
        dashboard_id: dashboards.dashboard_id,
      })
      .from(dashboards)
      .where(
        and(
          eq(dashboards.is_default, true),
          eq(dashboards.is_published, true),
          eq(dashboards.is_active, true)
        )
      )
      .limit(1);

    return defaultDashboard?.dashboard_id || null;
  } catch (error) {
    log.error('Error fetching default dashboard', error);
    return null;
  }
}

/**
 * Validate that a return URL is safe (internal path only)
 * Prevents open redirect vulnerabilities by ensuring the URL:
 * - Is a relative path (starts with /)
 * - Does not contain protocol (no http://, https://, //, etc.)
 * - Does not contain encoded characters that could bypass validation
 *
 * @param url - The URL to validate
 * @returns true if the URL is safe to redirect to
 */
function isValidReturnUrl(url: string): boolean {
  // Must be a string
  if (typeof url !== 'string' || !url) {
    return false;
  }

  // Decode URL to catch encoded bypass attempts
  let decodedUrl: string;
  try {
    decodedUrl = decodeURIComponent(url);
  } catch {
    // Invalid URL encoding
    return false;
  }

  // Must start with / (relative path)
  if (!decodedUrl.startsWith('/')) {
    return false;
  }

  // Must not start with // (protocol-relative URL)
  if (decodedUrl.startsWith('//')) {
    return false;
  }

  // Must not contain protocol indicators
  if (decodedUrl.includes('://') || decodedUrl.includes(':')) {
    return false;
  }

  // Must not contain backslashes (Windows path injection)
  if (decodedUrl.includes('\\')) {
    return false;
  }

  // Must not contain newlines (header injection)
  if (decodedUrl.includes('\n') || decodedUrl.includes('\r')) {
    return false;
  }

  return true;
}

/**
 * Get the default return URL for login
 * Returns the URL to redirect to after successful login
 * Prioritizes explicit returnUrl, then default dashboard, then /dashboard
 *
 * SECURITY: Validates returnUrl to prevent open redirect attacks
 */
export async function getDefaultReturnUrl(returnUrl?: string | null): Promise<string> {
  // If explicit returnUrl is provided, validate and use it
  if (returnUrl && isValidReturnUrl(returnUrl)) {
    return returnUrl;
  }

  // If returnUrl was provided but invalid, log a warning (potential attack)
  if (returnUrl && !isValidReturnUrl(returnUrl)) {
    log.warn('Invalid return URL rejected - potential open redirect attempt', {
      operation: 'getDefaultReturnUrl',
      providedUrl: returnUrl.substring(0, 100), // Truncate for logging
      component: 'auth',
      severity: 'medium',
    });
  }

  // Try to get default dashboard
  const defaultDashboardId = await getDefaultDashboardId();

  if (defaultDashboardId) {
    return `/dashboard/view/${defaultDashboardId}`;
  }

  // Fallback to /dashboard
  return '/dashboard';
}
