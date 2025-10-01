import { db } from '@/lib/db'
import { dashboards } from '@/lib/db/schema'
import { inArray } from 'drizzle-orm'
import type { InferSelectModel } from 'drizzle-orm'
import type { User } from './user-factory'

export type Dashboard = InferSelectModel<typeof dashboards>

/**
 * Configuration options for creating test dashboards
 */
export interface CreateDashboardOptions {
  dashboard_name?: string
  dashboard_description?: string
  dashboard_category_id?: number
  layout_config?: Record<string, unknown>
  is_active?: boolean
  is_published?: boolean
  created_by: string // Required: user ID who creates the dashboard
}

/**
 * Create a test dashboard with committed transaction
 *
 * IMPORTANT: This creates a dashboard in a COMMITTED transaction so it's visible
 * to services that use the global db connection. The dashboard will persist in the
 * test database and should be cleaned up.
 *
 * Use this factory when testing services that need to see the data.
 */
export async function createCommittedDashboard(options: CreateDashboardOptions): Promise<Dashboard> {
  const dashboardData = {
    dashboard_name: options.dashboard_name || `Test Dashboard ${Date.now()}`,
    dashboard_description: options.dashboard_description,
    dashboard_category_id: options.dashboard_category_id,
    layout_config: options.layout_config || {},
    is_active: options.is_active ?? true,
    is_published: options.is_published ?? false,
    created_by: options.created_by
  }

  const [dashboard] = await db
    .insert(dashboards)
    .values(dashboardData)
    .returning()

  if (!dashboard) {
    throw new Error('Failed to create test dashboard')
  }

  return dashboard
}

/**
 * Create a test dashboard for a specific user
 * Convenience wrapper that takes a User object
 */
export async function createDashboardForUser(user: User, options: Partial<CreateDashboardOptions> = {}): Promise<Dashboard> {
  return createCommittedDashboard({
    ...options,
    created_by: user.user_id
  })
}

/**
 * Create multiple test dashboards
 */
export async function createCommittedDashboards(
  count: number,
  baseOptions: CreateDashboardOptions
): Promise<Dashboard[]> {
  const dashboards: Dashboard[] = []

  for (let i = 0; i < count; i++) {
    const dashboard = await createCommittedDashboard({
      ...baseOptions,
      dashboard_name: `${baseOptions.dashboard_name || 'Test Dashboard'} ${i + 1}`
    })
    dashboards.push(dashboard)
  }

  return dashboards
}

/**
 * Cleanup function to delete dashboards created by tests
 * Call this in test cleanup to ensure no test data persists
 */
export async function deleteDashboards(dashboardIds: string[]): Promise<void> {
  if (dashboardIds.length === 0) return

  await db
    .delete(dashboards)
    .where(inArray(dashboards.dashboard_id, dashboardIds))
}
