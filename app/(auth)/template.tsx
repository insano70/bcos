'use client';

import { usePathname } from 'next/navigation';
import PageTransition from '@/components/transitions/page-transition';

/**
 * Auth route group template with page transitions
 * Applies to authentication pages (signin, signup, reset-password, etc.)
 *
 * Uses fade transition for a smooth, reliable entry to auth pages
 * NOTE: Changed from blurFade due to iOS Safari issues with filter:blur() animations
 * NOTE: Must be client component to access pathname for animation triggers
 */
export default function AuthTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <PageTransition variant="fade" key={pathname}>
      {children}
    </PageTransition>
  );
}
