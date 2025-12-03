export const metadata = {
  title: 'Configuration Dashboard - BCOS',
  description: 'Rheumatology practice management dashboard',
};

import { and, count, eq, isNull } from 'drizzle-orm';
import Link from 'next/link';
import { requireServerAnyPermission } from '@/lib/auth/server-rbac';
import { db, practices, staff_members, users } from '@/lib/db';
import { log } from '@/lib/logger';

async function getDashboardStats() {
  // SECURITY: Validate permissions BEFORE fetching aggregate statistics
  // User must have either 'analytics:read:organization' OR 'analytics:read:all'
  // to view dashboard statistics
  await requireServerAnyPermission(['analytics:read:organization', 'analytics:read:all']);

  try {
    const [practiceCount] = await db
      .select({ count: count() })
      .from(practices)
      .where(isNull(practices.deleted_at));

    const [userCount] = await db
      .select({ count: count() })
      .from(users)
      .where(isNull(users.deleted_at));

    const [staffCount] = await db
      .select({ count: count() })
      .from(staff_members)
      .where(isNull(staff_members.deleted_at));

    const [activePracticeCount] = await db
      .select({ count: count() })
      .from(practices)
      .where(and(eq(practices.status, 'active'), isNull(practices.deleted_at)));

    return {
      totalPractices: practiceCount?.count || 0,
      totalUsers: userCount?.count || 0,
      totalStaff: staffCount?.count || 0,
      activePractices: activePracticeCount?.count || 0,
    };
  } catch (error) {
    // Log dashboard errors for debugging
    log.error('Error fetching dashboard stats', error instanceof Error ? error : new Error(String(error)));
    return {
      totalPractices: 0,
      totalUsers: 0,
      totalStaff: 0,
      activePractices: 0,
    };
  }
}

export default async function ConfigureDashboard() {
  const stats = await getDashboardStats();

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
          Configuration Dashboard
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Manage your rheumatology practice website platform
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="text-blue-600 text-xl">🏥</span>
            </div>
            <div className="ml-4">
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {stats.totalPractices}
              </p>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Total Practices</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <span className="text-green-600 text-xl">✅</span>
            </div>
            <div className="ml-4">
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {stats.activePractices}
              </p>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Active Practices</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <span className="text-purple-600 text-xl">👥</span>
            </div>
            <div className="ml-4">
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {stats.totalUsers}
              </p>
              <p className="text-gray-600 dark:text-gray-400 text-sm">System Users</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <span className="text-yellow-600 text-xl">👨‍⚕️</span>
            </div>
            <div className="ml-4">
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {stats.totalStaff}
              </p>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Staff Members</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Quick Actions
          </h2>
          <div className="space-y-3">
            <Link
              href="/configure/practices"
              className="flex items-center p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                <span className="text-blue-600">🏥</span>
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">Manage Practices</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  View and edit rheumatology practices
                </p>
              </div>
            </Link>

            <Link
              href="/configure/users"
              className="flex items-center p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                <span className="text-purple-600">👥</span>
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">Manage Users</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  System user administration
                </p>
              </div>
            </Link>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            System Overview
          </h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
              <span className="text-gray-600 dark:text-gray-400">Database Status</span>
              <span className="inline-flex items-center px-2 py-1 text-xs font-medium text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                Connected
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
              <span className="text-gray-600 dark:text-gray-400">Template System</span>
              <span className="inline-flex items-center px-2 py-1 text-xs font-medium text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                Active
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
              <span className="text-gray-600 dark:text-gray-400">File Uploads</span>
              <span className="inline-flex items-center px-2 py-1 text-xs font-medium text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                Ready
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-600 dark:text-gray-400">Domain Routing</span>
              <span className="inline-flex items-center px-2 py-1 text-xs font-medium text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                Configured
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
