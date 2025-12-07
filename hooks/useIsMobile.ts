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

import { useEffect, useState, useRef } from 'react';

/**
 * Tailwind md breakpoint in pixels
 */
const MOBILE_BREAKPOINT = 768;

/**
 * Orientation type
 */
export type Orientation = 'portrait' | 'landscape';

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

/**
 * Hook to detect orientation changes on mobile devices
 * 
 * Useful for triggering chart resizes and layout adjustments when
 * the device is rotated between portrait and landscape modes.
 *
 * @param onOrientationChange - Optional callback fired when orientation changes
 * @returns Current orientation ('portrait' | 'landscape')
 */
export function useOrientation(onOrientationChange?: (orientation: Orientation) => void): Orientation {
  const [orientation, setOrientation] = useState<Orientation>(() => {
    if (typeof window === 'undefined') return 'portrait';
    return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
  });
  
  // Store callback in ref to avoid re-registering listeners
  const callbackRef = useRef(onOrientationChange);
  callbackRef.current = onOrientationChange;

  useEffect(() => {
    const getOrientation = (): Orientation => {
      return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
    };

    const handleOrientationChange = () => {
      // Small delay to let the browser finish updating dimensions
      setTimeout(() => {
        const newOrientation = getOrientation();
        setOrientation((prev) => {
          if (prev !== newOrientation) {
            callbackRef.current?.(newOrientation);
            return newOrientation;
          }
          return prev;
        });
      }, 100);
    };

    // Initial check
    const currentOrientation = getOrientation();
    setOrientation(currentOrientation);

    // Listen for orientation change event (mobile) and resize (desktop/fallback)
    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleOrientationChange);

    return () => {
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('resize', handleOrientationChange);
    };
  }, []);

  return orientation;
}

/**
 * Hook to trigger a callback when orientation changes
 * Useful for resizing charts when device is rotated
 *
 * @param callback - Function to call when orientation changes (debounced)
 */
export function useOrientationResize(callback: () => void): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const handleOrientationChange = () => {
      // Debounce to avoid multiple rapid calls during orientation animation
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        callbackRef.current();
      }, 150);
    };

    // Listen for orientation change event and resize
    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleOrientationChange);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('resize', handleOrientationChange);
    };
  }, []);
}

/**
 * Combined mobile detection and orientation hook
 * 
 * @returns Object with isMobile and orientation state
 */
export function useMobileAndOrientation(): {
  isMobile: boolean;
  orientation: Orientation;
  isPortrait: boolean;
  isLandscape: boolean;
} {
  const isMobile = useIsMobile();
  const orientation = useOrientation();
  
  return {
    isMobile,
    orientation,
    isPortrait: orientation === 'portrait',
    isLandscape: orientation === 'landscape',
  };
}

export default useIsMobile;





