'use client';

import { useId } from 'react';
import { useAuth } from '@/components/auth/rbac-auth-provider';
import { usePermissions } from '@/lib/hooks/use-permissions';
import Logo from './logo';
import { AdminMenuSection } from './sidebar/admin-menu-section';
import { DashboardMenuSection } from './sidebar/dashboard-menu-section';
import { useSidebarState } from './sidebar/use-sidebar-state';
import { WorkMenuSection } from './sidebar/work-menu-section';

/**
 * Main Sidebar Component
 *
 * Refactored for maintainability and clarity:
 * - Extracted section components for better organization
 * - Separated state management into custom hook
 * - Permission checks determine which sections to render
 *
 * Component Structure:
 * - Header (logo and close button)
 * - Dashboard Section (always visible when authenticated)
 * - Work Section (permission-gated)
 * - Admin Section (permission-gated, contains Configure and Monitor dropdowns)
 * - Expand Button (desktop sidebar expansion control)
 */
export default function Sidebar({ variant = 'default' }: { variant?: 'default' | 'v2' }) {
  const { rbacLoading } = useAuth();
  const { hasAnyPermission } = usePermissions();
  const { sidebar, sidebarOpen, setSidebarOpen, sidebarExpanded, setSidebarExpanded } =
    useSidebarState();
  const sidebarId = useId();

  // Check if user has any permissions to see Admin section items (Configure + Monitor)
  const hasAdminAccess = hasAnyPermission([
    'users:read:organization',
    'practices:read:own',
    'organizations:manage:all',
    'organizations:create:all',
    'organizations:update:organization',
    'organizations:delete:organization',
    'work-items:manage:organization',
    'analytics:read:all',
    'data-sources:read:organization',
  ]);

  // Check if user has any permissions to see Work section items
  const hasWorkAccess = hasAnyPermission([
    'work-items:read:own',
    'work-items:read:organization',
    'work-items:read:all',
  ]);

  // Don't render the sidebar until authentication is loaded
  if (rbacLoading) {
    return (
      <div className={`min-w-fit ${sidebarExpanded ? 'sidebar-expanded' : ''}`}>
        <div className="flex lg:flex! flex-col absolute z-40 left-0 top-0 lg:static lg:left-auto lg:top-auto lg:translate-x-0 h-[100dvh] overflow-y-scroll lg:overflow-y-auto no-scrollbar w-64 lg:w-20 lg:sidebar-expanded:!w-64 2xl:w-64! shrink-0 bg-white dark:bg-gray-800 p-4 transition-all duration-200 ease-in-out">
          {/* Loading placeholder */}
          <div className="flex justify-center items-center h-full">
            <div className="animate-pulse text-gray-400">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-w-fit ${sidebarExpanded ? 'sidebar-expanded' : ''}`}>
      {/* Sidebar backdrop (mobile only) */}
      <div
        className={`fixed inset-0 bg-gray-900/30 z-40 lg:hidden lg:z-auto transition-opacity duration-200 ${
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <div
        id={sidebarId}
        ref={sidebar}
        className={`flex lg:flex! flex-col absolute z-40 left-0 top-0 lg:static lg:left-auto lg:top-auto lg:translate-x-0 h-[100dvh] overflow-y-scroll lg:overflow-y-auto no-scrollbar w-64 lg:w-20 lg:sidebar-expanded:!w-64 2xl:w-64! shrink-0 bg-white dark:bg-gray-800 p-4 transition-all duration-200 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-64'} ${variant === 'v2' ? 'border-r border-gray-200 dark:border-gray-700/60' : 'rounded-r-2xl shadow-xs'}`}
      >
        {/* Sidebar header */}
        <div className="flex justify-between mb-10 pr-3 sm:px-2">
          {/* Close button */}
          <button type="button" className="lg:hidden text-gray-500 hover:text-gray-400"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-controls={sidebarId}
            aria-expanded={sidebarOpen}
          >
            <span className="sr-only">Close sidebar</span>
            <svg
              className="w-6 h-6 fill-current"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M10.7 18.7l1.4-1.4L7.8 13H20v-2H7.8l4.3-4.3-1.4-1.4L4 12z" />
            </svg>
          </button>
          {/* Logo */}
          <Logo />
        </div>

        {/* Links */}
        <div className="space-y-8">
          {/* Dashboard Section - Always visible when authenticated */}
          <DashboardMenuSection />

          {/* Work Section - Permission gated */}
          {hasWorkAccess && <WorkMenuSection />}

          {/* Admin Section - Permission gated, contains Configure and Monitor */}
          {hasAdminAccess && <AdminMenuSection />}
        </div>

        {/* Expand / collapse button */}
        <div className="pt-3 hidden lg:inline-flex 2xl:hidden justify-end mt-auto">
          <div className="w-12 pl-4 pr-3 py-2">
            <button type="button" className="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
              onClick={() => setSidebarExpanded(!sidebarExpanded)}
            >
              <span className="sr-only">Expand / collapse sidebar</span>
              <svg
                className="shrink-0 fill-current text-gray-400 dark:text-gray-500 sidebar-expanded:rotate-180"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 16 16"
              >
                <path d="M15 16a1 1 0 0 1-1-1V1a1 1 0 1 1 2 0v14a1 1 0 0 1-1 1ZM8.586 9H1a1 1 0 1 1 0-2h7.586l-2.793-2.793a1 1 0 1 1 1.414-1.414l4.5 4.5A.997.997 0 0 1 12 8a.999.999 0 0 1-.293.707l-4.5 4.5a1 1 0 1 1-1.414-1.414L8.586 9Z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
