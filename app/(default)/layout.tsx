'use client';

import { AuthTransitionOverlay } from '@/components/auth/auth-transition-overlay';
import { useAuth } from '@/components/auth/rbac-auth-provider';
import Header from '@/components/ui/header';
import Sidebar from '@/components/ui/sidebar';

/**
 * Default Layout
 *
 * Always renders the sidebar and header structure.
 * Shows a full-page overlay ON TOP during loading states.
 *
 * This approach prevents sidebar mount/unmount thrashing by keeping
 * the DOM structure stable - only the overlay visibility changes.
 */
export default function DefaultLayout({ children }: { children: React.ReactNode }) {
  const { isLoading: authLoading, rbacLoading } = useAuth();

  // Determine if we should show the loading overlay
  const showOverlay = authLoading || rbacLoading;

  return (
    <>
      {/* Loading overlay - renders ON TOP of everything when active */}
      {showOverlay && <AuthTransitionOverlay />}

      {/* Main layout structure - always rendered, covered by overlay when loading */}
      <div className="flex h-[100dvh] overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Content area */}
        <div className="relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
          {/*  Site header */}
          <Header />

          <main className="grow [&>*:first-child]:scroll-mt-16 bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
