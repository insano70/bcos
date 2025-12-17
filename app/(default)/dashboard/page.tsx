import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDefaultDashboardId } from '@/lib/services/default-dashboard-service';

/**
 * Dashboard Index Page
 *
 * Server component that immediately redirects to the default dashboard if one exists.
 * Calls the service directly (not via HTTP) for reliable server-side execution.
 */
export default async function DashboardPage() {
  // Get default dashboard directly from service (not via HTTP fetch)
  const defaultDashboardId = await getDefaultDashboardId();

  // If a default dashboard exists, redirect immediately (before any HTML is sent)
  if (defaultDashboardId) {
    redirect(`/dashboard/view/${defaultDashboardId}`);
  }

  // No default dashboard configured - show welcome page
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-2xl">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/20 mb-6">
            <svg
              className="w-8 h-8 text-violet-600 dark:text-violet-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
          </div>
          <h1 className="text-3xl md:text-4xl text-gray-800 dark:text-gray-100 font-bold mb-4">
            Welcome!
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
            No default dashboard has been configured yet. Please contact your administrator to set
            up a home dashboard, or explore the available options below.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {/* Link styled as Button variant="violet" */}
            <Link
              href="/dashboard/analytics"
              className="btn bg-violet-500 hover:bg-violet-600 text-white border-transparent rounded-lg shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-violet-500 dark:focus-visible:ring-offset-gray-900"
            >
              <svg className="w-4 h-4 mr-2 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              View Analytics
            </Link>
            {/* Link styled as Button variant="secondary" */}
            <Link
              href="/configure/dashboards"
              className="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300 rounded-lg shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-violet-500 dark:focus-visible:ring-offset-gray-900"
            >
              <svg className="w-4 h-4 mr-2 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              Configure Dashboards
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
