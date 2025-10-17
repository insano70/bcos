'use client';

import { useSelectedLayoutSegments } from 'next/navigation';
import { useAppProvider } from '@/app/app-provider';
import { ProtectedComponent } from '@/components/rbac/protected-component';
import { useWindowWidth } from '@/components/utils/use-window-width';
import { usePublishedDashboards } from '@/lib/hooks/use-published-dashboards';
import SidebarLink from '../sidebar-link';
import SidebarLinkGroup from '../sidebar-link-group';

/**
 * Dashboard Menu Section
 * Handles dashboard navigation with published dashboards
 * Contains business logic for loading and displaying dashboards
 */
export function DashboardMenuSection() {
  const segments = useSelectedLayoutSegments();
  const { sidebarExpanded, setSidebarExpanded } = useAppProvider();
  const breakpoint = useWindowWidth();
  const expandOnly = !sidebarExpanded && breakpoint && breakpoint >= 1024 && breakpoint < 1536;

  const {
    dashboards: publishedDashboards,
    defaultDashboard,
    loading: dashboardsLoading,
  } = usePublishedDashboards();

  return (
    <div>
      <h3 className="text-xs uppercase text-gray-400 dark:text-gray-500 font-semibold pl-3">
        <span
          className="hidden lg:block lg:sidebar-expanded:hidden 2xl:hidden text-center w-6"
          aria-hidden="true"
        >
          •••
        </span>
        <span className="lg:hidden lg:sidebar-expanded:block 2xl:block">Pages</span>
      </h3>
      <ul className="mt-3">
        {/* Dashboard */}
        <SidebarLinkGroup open={segments.includes('dashboard')}>
          {(handleClick, open) => {
            return (
              <>
                <a
                  href="#0"
                  className={`block text-gray-800 dark:text-gray-100 truncate transition ${
                    segments.includes('dashboard')
                      ? ''
                      : 'hover:text-gray-900 dark:hover:text-white'
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    expandOnly ? setSidebarExpanded(true) : handleClick();
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <svg
                        className={`shrink-0 fill-current ${segments.includes('dashboard') ? 'text-violet-500' : 'text-gray-400 dark:text-gray-500'}`}
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                      >
                        <path d="M5.936.278A7.983 7.983 0 0 1 8 0a8 8 0 1 1-8 8c0-.722.104-1.413.278-2.064a1 1 0 1 1 1.932.516A5.99 5.99 0 0 0 2 8a6 6 0 1 0 6-6c-.53 0-1.045.076-1.548.21A1 1 0 1 1 5.936.278Z" />
                        <path d="M6.068 7.482A2.003 2.003 0 0 0 8 10a2 2 0 1 0-.518-3.932L3.707 2.293a1 1 0 0 0-1.414 1.414l3.775 3.775Z" />
                      </svg>
                      <span className="text-sm font-medium ml-4 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">
                        Dashboard
                      </span>
                    </div>
                    {/* Icon */}
                    <div className="flex shrink-0 ml-2">
                      <svg
                        className={`w-3 h-3 shrink-0 ml-1 fill-current text-gray-400 dark:text-gray-500 ${open && 'rotate-180'}`}
                        viewBox="0 0 12 12"
                      >
                        <path d="M5.9 11.4L.5 6l1.4-1.4 4 4 4-4L11.3 6z" />
                      </svg>
                    </div>
                  </div>
                </a>
                <div className="lg:hidden lg:sidebar-expanded:block 2xl:block">
                  <ul className={`pl-8 mt-1 ${!open && 'hidden'}`}>
                    {/* Default Dashboard Home - Show if default dashboard is set */}
                    {defaultDashboard && (
                      <li className="mb-1 last:mb-0">
                        <SidebarLink href={`/dashboard/view/${defaultDashboard.dashboard_id}`}>
                          <span className="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200 flex items-center">
                            <svg
                              className="w-3 h-3 mr-1.5"
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
                            Home
                          </span>
                        </SidebarLink>
                      </li>
                    )}

                    {/* Published Dashboards - Protected by Analytics RBAC */}
                    <ProtectedComponent
                      permissions={[
                        'analytics:read:all',
                        'analytics:read:organization',
                        'analytics:read:own',
                      ]}
                      requireAll={false}
                    >
                      {/* Render published dashboards as menu items */}
                      {!dashboardsLoading &&
                        publishedDashboards.map((dashboard) => (
                          <li key={dashboard.dashboard_id} className="mb-1 last:mb-0">
                            <SidebarLink href={`/dashboard/view/${dashboard.dashboard_id}`}>
                              <span className="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">
                                {dashboard.dashboard_name}
                              </span>
                            </SidebarLink>
                          </li>
                        ))}
                    </ProtectedComponent>
                  </ul>
                </div>
              </>
            );
          }}
        </SidebarLinkGroup>
      </ul>
    </div>
  );
}
