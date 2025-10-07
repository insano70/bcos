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
 * Get the default return URL for login
 * Returns the URL to redirect to after successful login
 * Prioritizes explicit returnUrl, then default dashboard, then /dashboard
 */
export async function getDefaultReturnUrl(returnUrl?: string | null): Promise<string> {
  // If explicit returnUrl is provided, use it
  if (returnUrl) {
    return returnUrl;
  }

  // Try to get default dashboard
  const defaultDashboardId = await getDefaultDashboardId();

  if (defaultDashboardId) {
    return `/dashboard/view/${defaultDashboardId}`;
  }

  // Fallback to /dashboard
  return '/dashboard';
}
