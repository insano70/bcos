/**
 * ScrollableLegendContainer Component
 *
 * A container for chart legends that provides visual indication of scrollable content.
 * Features:
 * - Subtle border and background to distinguish the legend area
 * - Fade gradient at bottom when more content exists below
 * - Fade gradient at top when scrolled down
 * - Compact styling optimized for chart legends
 */

'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

interface ScrollableLegendProps {
  children: ReactNode;
  maxHeight?: number;
  className?: string;
}

export function ScrollableLegendContainer({
  children,
  maxHeight = 56,
  className = '',
}: ScrollableLegendProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const checkScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const hasOverflow = scrollHeight > clientHeight;
      
      // Show top fade if scrolled down
      setShowTopFade(scrollTop > 4);
      
      // Show bottom fade if more content below (with 4px threshold)
      setShowBottomFade(hasOverflow && scrollTop < scrollHeight - clientHeight - 4);
    };

    // Initial check
    checkScroll();

    // Check on scroll
    container.addEventListener('scroll', checkScroll, { passive: true });

    // Check on resize (content might change)
    const resizeObserver = new ResizeObserver(checkScroll);
    resizeObserver.observe(container);

    // Also observe mutations to detect content changes
    const mutationObserver = new MutationObserver(checkScroll);
    mutationObserver.observe(container, { childList: true, subtree: true });

    return () => {
      container.removeEventListener('scroll', checkScroll);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  return (
    <div className={`relative ${className}`}>
      {/* Top fade indicator */}
      {showTopFade && (
        <div 
          className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-gray-100 dark:from-gray-800 to-transparent z-10 pointer-events-none rounded-t"
          aria-hidden="true"
        />
      )}

      {/* Scrollable content */}
      <div
        ref={containerRef}
        className="overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent"
        style={{ maxHeight }}
      >
        <div className="px-2 py-1.5 bg-gray-50/80 dark:bg-gray-800/50 rounded border border-gray-200/60 dark:border-gray-700/60">
          {children}
        </div>
      </div>

      {/* Bottom fade indicator */}
      {showBottomFade && (
        <div 
          className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-gray-100 dark:from-gray-800 to-transparent z-10 pointer-events-none rounded-b"
          aria-hidden="true"
        />
      )}
    </div>
  );
}

/**
 * Compact legend item styles for use in chart components
 * These values replace the current 36px button height with a more compact design
 */
export const COMPACT_LEGEND_STYLES = {
  button: {
    minHeight: '26px',
    padding: '2px 6px',
    margin: '1px',
    borderRadius: '4px',
  },
  colorBox: {
    width: '8px',
    height: '8px',
    marginRight: '6px',
  },
  value: {
    fontSize: '0.8125rem', // 13px
    lineHeight: '1.3',
    marginRight: '4px',
  },
  label: {
    fontSize: '0.6875rem', // 11px
    lineHeight: '1.2',
    maxWidth: '90px',
  },
} as const;

