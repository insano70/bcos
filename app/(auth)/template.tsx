'use client';

import { usePathname } from 'next/navigation';
import PageTransition from '@/components/transitions/page-transition';

/**
 * Auth route group template with page transitions
 * Applies to authentication pages (signin, signup, reset-password, etc.)
 *
 * Uses blurFade transition for a smooth, focused entry to auth pages
 * NOTE: Must be client component to access pathname for animation triggers
 */
export default function AuthTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <PageTransition variant="blurFade" key={pathname}>
      {children}
    </PageTransition>
  );
}
