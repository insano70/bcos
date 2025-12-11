'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { apiClient } from '@/lib/api/client';
import UserAnnouncementModal from './user-announcement-modal';

const POLL_INTERVAL_MS = 60000; // Poll every 60 seconds
const SESSION_STORAGE_KEY = 'announcements:shownThisSession';

export default function AnnouncementBadge() {
  const [count, setCount] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const hasAutoShownRef = useRef(false);

  const fetchCount = useCallback(async () => {
    try {
      const response = await apiClient.get<{ count: number }>('/api/user/announcements/count');
      setCount(response.count);
      return response.count;
    } catch {
      // Silently handle error - announcements are non-critical
      return 0;
    }
  }, []);

  useEffect(() => {
    // Initial fetch with auto-show logic
    const initializeAndAutoShow = async () => {
      const announcementCount = await fetchCount();

      // Check if we should auto-show the modal
      // Only show if: count > 0, haven't auto-shown yet, and not shown this session
      if (
        announcementCount > 0 &&
        !hasAutoShownRef.current &&
        typeof window !== 'undefined' &&
        !sessionStorage.getItem(SESSION_STORAGE_KEY)
      ) {
        hasAutoShownRef.current = true;
        sessionStorage.setItem(SESSION_STORAGE_KEY, 'true');
        setIsModalOpen(true);
      }
    };

    initializeAndAutoShow();

    // Poll periodically (no auto-show on subsequent polls)
    const interval = setInterval(fetchCount, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [fetchCount]);

  const handleCountChange = useCallback((newCount: number) => {
    setCount(newCount);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`relative w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
          isHovered || isModalOpen
            ? 'bg-gray-200 dark:bg-gray-800'
            : 'hover:bg-gray-100 lg:hover:bg-gray-200 dark:hover:bg-gray-700/50 dark:lg:hover:bg-gray-800'
        }`}
        aria-label={count > 0 ? `${count} unread announcements` : 'No new announcements'}
      >
        <svg
          className="fill-current text-gray-500/80 dark:text-gray-400/80"
          width={16}
          height={16}
          viewBox="0 0 16 16"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M8 0a1 1 0 0 1 1 1v.1A5.002 5.002 0 0 1 13 6v3.586l.707.707A1 1 0 0 1 13 12H3a1 1 0 0 1-.707-1.707L3 9.586V6a5.002 5.002 0 0 1 4-4.9V1a1 1 0 0 1 1-1ZM5 6v4a1 1 0 0 0 .293.707L5.586 11h4.828l.293-.293A1 1 0 0 0 11 10V6a3 3 0 1 0-6 0Z" />
          <path d="M6.268 13a2 2 0 0 0 3.464 0H6.268Z" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold text-white bg-red-500 border-2 border-gray-100 dark:border-gray-900 rounded-full">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      <UserAnnouncementModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCountChange={handleCountChange}
      />
    </>
  );
}
