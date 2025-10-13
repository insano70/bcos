import { useEffect, useRef } from 'react';
import { useAppProvider } from '@/app/app-provider';

/**
 * Sidebar State Management Hook
 * Handles sidebar open/close state and keyboard/mouse interactions
 * Extracted from main sidebar component for better separation of concerns
 */
export function useSidebarState() {
  const sidebar = useRef<HTMLDivElement>(null);
  const { sidebarOpen, setSidebarOpen, sidebarExpanded, setSidebarExpanded } = useAppProvider();

  // Close on click outside
  useEffect(() => {
    const clickHandler = ({ target }: { target: EventTarget | null }): void => {
      if (!sidebar.current) return;
      if (!sidebarOpen || sidebar.current.contains(target as Node)) return;
      setSidebarOpen(false);
    };
    document.addEventListener('click', clickHandler);
    return () => document.removeEventListener('click', clickHandler);
  }, [sidebarOpen, setSidebarOpen]);

  // Close if the ESC key is pressed
  useEffect(() => {
    const keyHandler = ({ keyCode }: { keyCode: number }): void => {
      if (!sidebarOpen || keyCode !== 27) return;
      setSidebarOpen(false);
    };
    document.addEventListener('keydown', keyHandler);
    return () => document.removeEventListener('keydown', keyHandler);
  }, [sidebarOpen, setSidebarOpen]);

  return {
    sidebar,
    sidebarOpen,
    setSidebarOpen,
    sidebarExpanded,
    setSidebarExpanded,
  };
}
