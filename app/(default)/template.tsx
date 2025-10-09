'use client';

import { usePathname } from 'next/navigation';
import PageTransition from '@/components/transitions/page-transition';

/**
 * Default route group template with page transitions
 * Applies to all admin/dashboard pages under (default) route group
 *
 * Uses slide transition for navigating between dashboard pages
 * NOTE: Must be client component to access pathname for animation triggers
 */
export default function DefaultTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <PageTransition variant="slide" key={pathname}>
      {children}
    </PageTransition>
  );
}
