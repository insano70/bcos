/**
 * useIsMobile Hook
 *
 * Detects if user is on a mobile device based on viewport width.
 * Uses Tailwind's md breakpoint (768px) as the threshold.
 *
 * Pattern: Same as hierarchy-select.tsx mobile detection
 *
 * @module hooks/useIsMobile
 */

import { useEffect, useState } from 'react';

/**
 * Tailwind md breakpoint in pixels
 */
const MOBILE_BREAKPOINT = 768;

/**
 * Hook to detect mobile viewport
 *
 * @returns true if viewport width < 768px (mobile), false otherwise (desktop)
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };

    // Initial check
    checkMobile();

    // Listen for resize
    window.addEventListener('resize', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  return isMobile;
}

export default useIsMobile;


