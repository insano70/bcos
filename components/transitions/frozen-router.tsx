'use client';

import { useContext, useRef, createContext, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { LayoutRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';

/**
 * FrozenRouter Component
 *
 * Freezes the router context to prevent route changes from
 * unmounting components during Framer Motion exit animations.
 *
 * This is an advanced pattern for smooth page transitions with
 * both entry and exit animations in Next.js App Router.
 *
 * Based on: https://www.imcorfitz.com/posts/adding-framer-motion-page-transitions-to-next-js-app-router
 *
 * Usage:
 * ```tsx
 * <AnimatePresence mode="wait">
 *   <FrozenRouter key={pathname}>
 *     {children}
 *   </FrozenRouter>
 * </AnimatePresence>
 * ```
 */

interface FrozenRouterProps {
  children: ReactNode;
}

export default function FrozenRouter({ children }: FrozenRouterProps) {
  const context = useContext(LayoutRouterContext);
  const frozen = useRef(context).current;

  if (!frozen) {
    return <>{children}</>;
  }

  return (
    <LayoutRouterContext.Provider value={frozen}>
      {children}
    </LayoutRouterContext.Provider>
  );
}

/**
 * Hook to get current pathname for AnimatePresence key
 */
export function useTransitionKey() {
  return usePathname();
}
