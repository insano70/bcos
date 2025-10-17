'use client';

import { usePathname } from 'next/navigation';
import { ProtectedComponent } from '@/components/rbac/protected-component';
import SidebarLink from '../sidebar-link';

/**
 * Work Menu Section
 * Handles work items navigation with permission checking
 * Simple focused component for work-related menu items
 */
export function WorkMenuSection() {
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
        <span className="lg:hidden lg:sidebar-expanded:block 2xl:block">Work</span>
      </h3>
      <ul className="mt-3">
        {/* Work Items */}
        <ProtectedComponent
          permissions={[
            'work-items:read:own',
            'work-items:read:organization',
            'work-items:read:all',
          ]}
          requireAll={false}
        >
          <li
            className={`pl-4 pr-3 py-2 rounded-lg mb-0.5 last:mb-0 bg-[linear-gradient(135deg,var(--tw-gradient-stops))] ${pathname.includes('work') && 'from-violet-500/[0.12] dark:from-violet-500/[0.24] to-violet-500/[0.04]'}`}
          >
            <SidebarLink href="/work">
              <div className="flex items-center">
                <svg
                  className={`shrink-0 fill-current ${pathname.includes('work') ? 'text-violet-500' : 'text-gray-400 dark:text-gray-500'}`}
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                >
                  <path d="M14 0H2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2Zm-1 10H9v4H7v-4H3V8h4V4h2v4h4v2Z" />
                </svg>
                <span className="text-sm font-medium ml-4 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">
                  Work Items
                </span>
              </div>
            </SidebarLink>
          </li>
        </ProtectedComponent>
      </ul>
    </div>
  );
}
