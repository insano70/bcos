'use client';

import { useSelectedLayoutSegments } from 'next/navigation';
import { useAppProvider } from '@/app/app-provider';
import { ProtectedComponent } from '@/components/rbac/protected-component';
import { useWindowWidth } from '@/components/utils/use-window-width';
import SidebarLink from '../sidebar-link';
import SidebarLinkGroup from '../sidebar-link-group';

/**
 * Admin Menu Section
 * Wrapper section containing Configure and Monitor dropdowns
 * Contains business logic for permission-based menu rendering
 */
export function AdminMenuSection() {
  const segments = useSelectedLayoutSegments();
  const { sidebarExpanded, setSidebarExpanded } = useAppProvider();
  const breakpoint = useWindowWidth();
  const expandOnly = !sidebarExpanded && breakpoint && breakpoint >= 1024 && breakpoint < 1536;

  return (
    <div>
      <h3 className="text-xs uppercase text-gray-400 dark:text-gray-500 font-semibold pl-3">
        <span
          className="hidden lg:block lg:sidebar-expanded:hidden 2xl:hidden text-center w-6"
          aria-hidden="true"
        >
          •••
        </span>
        <span className="lg:hidden lg:sidebar-expanded:block 2xl:block">Admin</span>
      </h3>
      <ul className="mt-3">
        {/* Configure Dropdown */}
        <SidebarLinkGroup open={segments.includes('configure')}>
          {(handleClick, open) => {
            return (
              <>
                <a
                  href="#0"
                  className={`block text-gray-800 dark:text-gray-100 truncate transition ${
                    segments.includes('configure')
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
                        className={`shrink-0 fill-current ${segments.includes('configure') ? 'text-violet-500' : 'text-gray-400 dark:text-gray-500'}`}
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                      >
                        <path
                          d="M10.5 1a3.502 3.502 0 0 1 3.355 2.5H15a1 1 0 1 1 0 2h-1.145a3.502 3.502 0 0 1-6.71 0H1a1 1 0 0 1 0-2h6.145A3.502 3.502 0 0 1 10.5 1ZM9 4.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0ZM5.5 9a3.502 3.502 0 0 1 3.355 2.5H15a1 1 0 1 1 0 2H8.855a3.502 3.502 0 0 1-6.71 0H1a1 1 0 1 1 0-2h1.145A3.502 3.502 0 0 1 5.5 9ZM4 12.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0Z"
                          fillRule="evenodd"
                        />
                      </svg>
                      <span className="text-sm font-medium ml-4 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">
                        Configure
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
                    {/* Users - Protected by RBAC */}
                    <ProtectedComponent permission="users:read:organization">
                      <li className="mb-1 last:mb-0">
                        <SidebarLink href="/configure/users">
                          <span className="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">
                            Users
                          </span>
                        </SidebarLink>
                      </li>
                    </ProtectedComponent>

                    {/* Practices - Protected by RBAC */}
                    <ProtectedComponent permission="practices:read:own">
                      <li className="mb-1 last:mb-0">
                        <SidebarLink href="/configure/practices">
                          <span className="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">
                            Practices
                          </span>
                        </SidebarLink>
                      </li>
                    </ProtectedComponent>

                    {/* Organizations - Protected by RBAC */}
                    <ProtectedComponent
                      permissions={[
                        'organizations:manage:all',
                        'organizations:create:all',
                        'organizations:update:organization',
                        'organizations:delete:organization',
                      ]}
                      requireAll={false}
                    >
                      <li className="mb-1 last:mb-0">
                        <SidebarLink href="/configure/organizations">
                          <span className="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">
                            Organizations
                          </span>
                        </SidebarLink>
                      </li>
                    </ProtectedComponent>

                    {/* Work Item Types - Protected by RBAC */}
                    <ProtectedComponent permission="work-items:manage:organization">
                      <li className="mb-1 last:mb-0">
                        <SidebarLink href="/configure/work-item-types">
                          <span className="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">
                            Work Item Types
                          </span>
                        </SidebarLink>
                      </li>
                    </ProtectedComponent>

                    {/* Charts - Protected by Analytics RBAC */}
                    <ProtectedComponent permission="analytics:read:all">
                      <li className="mb-1 last:mb-0">
                        <SidebarLink href="/configure/charts">
                          <span className="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">
                            Charts
                          </span>
                        </SidebarLink>
                      </li>
                    </ProtectedComponent>

                    {/* Data Sources - Protected by Data Sources RBAC (Configure requires manage/create permissions) */}
                    <ProtectedComponent
                      permissions={['data-sources:manage:all', 'data-sources:create:all']}
                      requireAll={false}
                    >
                      <li className="mb-1 last:mb-0">
                        <SidebarLink href="/configure/data-sources">
                          <span className="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">
                            Data Sources
                          </span>
                        </SidebarLink>
                      </li>
                    </ProtectedComponent>

                    {/* Dashboards - Protected by Analytics RBAC */}
                    <ProtectedComponent permission="analytics:read:all">
                      <li className="mb-1 last:mb-0">
                        <SidebarLink href="/configure/dashboards">
                          <span className="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">
                            Dashboards
                          </span>
                        </SidebarLink>
                      </li>
                    </ProtectedComponent>
                  </ul>
                </div>
              </>
            );
          }}
        </SidebarLinkGroup>

        {/* Monitor Dropdown - Only show if user has Command Center access */}
        <ProtectedComponent permission="analytics:read:all">
          <SidebarLinkGroup open={segments.includes('admin')}>
            {(handleClick, open) => {
              return (
                <>
                  <a
                    href="#0"
                    className={`block text-gray-800 dark:text-gray-100 truncate transition ${
                      segments.includes('admin') ? '' : 'hover:text-gray-900 dark:hover:text-white'
                    }`}
                    onClick={(e) => {
                      e.preventDefault();
                      expandOnly ? setSidebarExpanded(true) : handleClick();
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <svg
                          className={`shrink-0 fill-current ${segments.includes('admin') ? 'text-violet-500' : 'text-gray-400 dark:text-gray-500'}`}
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                        >
                          <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm0 12c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zm1-3H7V4h2v5z" />
                        </svg>
                        <span className="text-sm font-medium ml-4 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">
                          Monitor
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
                      {/* Command Center - Protected by Admin RBAC */}
                      <ProtectedComponent permission="analytics:read:all">
                        <li className="mb-1 last:mb-0">
                          <SidebarLink href="/admin/command-center">
                            <span className="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">
                              Command Center
                            </span>
                          </SidebarLink>
                        </li>
                      </ProtectedComponent>
                    </ul>
                  </div>
                </>
              );
            }}
          </SidebarLinkGroup>
        </ProtectedComponent>
      </ul>
    </div>
  );
}
