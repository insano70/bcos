'use client';

import { usePathname } from 'next/navigation';
import { ProtectedComponent } from '@/components/rbac/protected-component';
import SidebarLink from '../sidebar-link';
import SidebarLinkGroup from '../sidebar-link-group';

/**
 * Data Explorer Menu Section
 * Handles Data Explorer navigation with permission checking
 * Includes Explorer (query interface), History, and Metadata management
 */
export function DataExplorerMenuSection() {
  const pathname = usePathname();

  return (
    <div>
      <h3 className="text-xs uppercase text-gray-400 dark:text-gray-500 font-semibold pl-3">
        <span
          className="hidden lg:block lg:sidebar-expanded:hidden 2xl:hidden text-center w-6"
          aria-hidden="true"
        >
          •••
        </span>
        <span className="lg:hidden lg:sidebar-expanded:block 2xl:block">Data</span>
      </h3>
      <ul className="mt-3">
        {/* Data Explorer - Permission gated */}
        <ProtectedComponent
          permissions={[
            'data-explorer:query:organization',
            'data-explorer:query:all',
            'data-explorer:execute:organization',
            'data-explorer:execute:all',
            'data-explorer:metadata:read:organization',
            'data-explorer:metadata:read:all',
          ]}
          requireAll={false}
        >
          <SidebarLinkGroup open={pathname.includes('data/explorer')}>
            {(handleClick, open) => {
              return (
                <>
                  <button
                    type="button"
                    className={`relative flex items-center font-medium w-full pl-4 pr-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900/20 mb-0.5 ${pathname.includes('data/explorer') && 'bg-[linear-gradient(135deg,var(--tw-gradient-stops))] from-violet-500/[0.12] dark:from-violet-500/[0.24] to-violet-500/[0.04]'}`}
                    onClick={(e) => {
                      e.preventDefault();
                      handleClick();
                    }}
                  >
                    <div className="flex items-center">
                      <svg
                        className={`shrink-0 fill-current ${pathname.includes('data/explorer') ? 'text-violet-500' : 'text-gray-400 dark:text-gray-500'}`}
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                      >
                        <path d="M14 2v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1zm-3 4H5v1h6V6zm0 3H5v1h6V9z" />
                      </svg>
                      <span className="text-sm font-medium ml-4 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">
                        Explorer
                      </span>
                    </div>
                    <div className="flex shrink-0 ml-2 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">
                      <svg
                        className={`w-3 h-3 shrink-0 ml-1 fill-current text-gray-400 dark:text-gray-500 ${open && 'rotate-180'}`}
                        viewBox="0 0 12 12"
                      >
                        <path d="M5.9 11.4L.5 6l1.4-1.4 4 4 4-4L11.3 6z" />
                      </svg>
                    </div>
                  </button>
                  <div className="lg:hidden lg:sidebar-expanded:block 2xl:block">
                    <ul className={`pl-8 mt-1 ${!open && 'hidden'}`}>
                      {/* Query Interface */}
                      <ProtectedComponent
                        permissions={['data-explorer:query:organization', 'data-explorer:query:all']}
                        requireAll={false}
                      >
                        <li className="mb-1 last:mb-0">
                          <SidebarLink href="/data/explorer">
                            <span className="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">
                              Query
                            </span>
                          </SidebarLink>
                        </li>
                      </ProtectedComponent>

                      {/* Query History */}
                      <ProtectedComponent
                        permissions={[
                          'data-explorer:history:read:own',
                          'data-explorer:history:read:organization',
                          'data-explorer:history:read:all',
                        ]}
                        requireAll={false}
                      >
                        <li className="mb-1 last:mb-0">
                          <SidebarLink href="/data/explorer/history">
                            <span className="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">
                              History
                            </span>
                          </SidebarLink>
                        </li>
                      </ProtectedComponent>

                      {/* Metadata Management */}
                      <ProtectedComponent
                        permissions={[
                          'data-explorer:metadata:read:organization',
                          'data-explorer:metadata:read:all',
                          'data-explorer:metadata:manage:all',
                        ]}
                        requireAll={false}
                      >
                        <li className="mb-1 last:mb-0">
                          <SidebarLink href="/data/explorer/metadata">
                            <span className="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">
                              Metadata
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

