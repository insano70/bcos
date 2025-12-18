'use client';

import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { useCallback, useEffect, useId, useReducer } from 'react';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

import { apiClient } from '@/lib/api/client';
import { renderMarkdown } from '@/lib/utils/markdown-renderer';
import { SafeHtmlRenderer } from '@/lib/utils/safe-html-renderer';

interface Announcement {
  announcement_id: string;
  subject: string;
  body: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  created_at: string;
}

interface ReadAnnouncement extends Announcement {
  read_at: string;
}

type TabType = 'unread' | 'history';

// ============================================================================
// Modal State Reducer
// ============================================================================

interface ModalState {
  activeTab: TabType;
  announcements: Announcement[];
  historyAnnouncements: ReadAnnouncement[];
  loading: boolean;
  historyLoading: boolean;
  historyLoaded: boolean;
  markingRead: string | null;
  markingAllRead: boolean;
  error: string | null;
  historyError: string | null;
}

type ModalAction =
  | { type: 'SET_TAB'; tab: TabType }
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; announcements: Announcement[] }
  | { type: 'FETCH_ERROR'; error: string }
  | { type: 'HISTORY_FETCH_START' }
  | { type: 'HISTORY_FETCH_SUCCESS'; announcements: ReadAnnouncement[] }
  | { type: 'HISTORY_FETCH_ERROR'; error: string }
  | { type: 'MARK_READ_START'; announcementId: string }
  | { type: 'MARK_READ_SUCCESS'; announcementId: string }
  | { type: 'MARK_READ_ERROR'; error: string }
  | { type: 'MARK_ALL_READ_START' }
  | { type: 'MARK_ALL_READ_SUCCESS' }
  | { type: 'MARK_ALL_READ_ERROR'; error: string }
  | { type: 'RESET_HISTORY' }
  | { type: 'RESET_ALL' };

const initialState: ModalState = {
  activeTab: 'unread',
  announcements: [],
  historyAnnouncements: [],
  loading: true,
  historyLoading: false,
  historyLoaded: false,
  markingRead: null,
  markingAllRead: false,
  error: null,
  historyError: null,
};

function modalReducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case 'SET_TAB':
      return { ...state, activeTab: action.tab };
    case 'FETCH_START':
      return { ...state, loading: true, error: null };
    case 'FETCH_SUCCESS':
      return { ...state, loading: false, announcements: action.announcements };
    case 'FETCH_ERROR':
      return { ...state, loading: false, error: action.error };
    case 'HISTORY_FETCH_START':
      return { ...state, historyLoading: true, historyError: null };
    case 'HISTORY_FETCH_SUCCESS':
      return {
        ...state,
        historyLoading: false,
        historyLoaded: true,
        historyAnnouncements: action.announcements,
      };
    case 'HISTORY_FETCH_ERROR':
      return { ...state, historyLoading: false, historyError: action.error };
    case 'MARK_READ_START':
      return { ...state, markingRead: action.announcementId, error: null };
    case 'MARK_READ_SUCCESS':
      return {
        ...state,
        markingRead: null,
        announcements: state.announcements.filter(
          (a) => a.announcement_id !== action.announcementId
        ),
        historyLoaded: false, // Invalidate history cache
      };
    case 'MARK_READ_ERROR':
      return { ...state, markingRead: null, error: action.error };
    case 'MARK_ALL_READ_START':
      return { ...state, markingAllRead: true, error: null };
    case 'MARK_ALL_READ_SUCCESS':
      return {
        ...state,
        markingAllRead: false,
        announcements: [],
        historyLoaded: false, // Invalidate history cache
      };
    case 'MARK_ALL_READ_ERROR':
      return { ...state, markingAllRead: false, error: action.error };
    case 'RESET_HISTORY':
      return {
        ...state,
        historyLoaded: false,
        historyAnnouncements: [],
        historyError: null,
      };
    case 'RESET_ALL':
      return {
        ...initialState,
        loading: true,
      };
    default:
      return state;
  }
}

interface UserAnnouncementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCountChange?: (count: number) => void;
}

const priorityConfig = {
  urgent: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    badge: 'bg-red-500 text-white',
    label: 'Urgent',
  },
  high: {
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    border: 'border-orange-200 dark:border-orange-800',
    badge: 'bg-orange-500 text-white',
    label: 'High',
  },
  normal: {
    bg: 'bg-white dark:bg-gray-800',
    border: 'border-gray-200 dark:border-gray-700',
    badge: 'bg-gray-500 text-white',
    label: 'Normal',
  },
  low: {
    bg: 'bg-gray-50 dark:bg-gray-800/50',
    border: 'border-gray-200 dark:border-gray-700',
    badge: 'bg-gray-400 text-white',
    label: 'Low',
  },
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  }
}

export default function UserAnnouncementModal({
  isOpen,
  onClose,
  onCountChange,
}: UserAnnouncementModalProps) {
  const [state, dispatch] = useReducer(modalReducer, initialState);
  const {
    activeTab,
    announcements,
    historyAnnouncements,
    loading,
    historyLoading,
    historyLoaded,
    markingRead,
    markingAllRead,
    error,
    historyError,
  } = state;

  const panelIdPrefix = useId();
  const unreadPanelId = `${panelIdPrefix}-unread`;
  const historyPanelId = `${panelIdPrefix}-history`;

  const fetchAnnouncements = useCallback(async () => {
    try {
      dispatch({ type: 'FETCH_START' });
      const response = await apiClient.get<{
        announcements: Announcement[];
        count: number;
      }>('/api/user/announcements');

      dispatch({ type: 'FETCH_SUCCESS', announcements: response.announcements });
      onCountChange?.(response.count);
    } catch {
      dispatch({ type: 'FETCH_ERROR', error: 'Failed to load announcements. Please try again.' });
    }
  }, [onCountChange]);

  const fetchHistory = useCallback(async () => {
    if (historyLoaded) return; // Only fetch once per modal open

    try {
      dispatch({ type: 'HISTORY_FETCH_START' });
      const response = await apiClient.get<{
        announcements: ReadAnnouncement[];
        count: number;
      }>('/api/user/announcements/history');

      dispatch({ type: 'HISTORY_FETCH_SUCCESS', announcements: response.announcements });
    } catch {
      dispatch({ type: 'HISTORY_FETCH_ERROR', error: 'Failed to load history. Please try again.' });
    }
  }, [historyLoaded]);

  useEffect(() => {
    if (isOpen) {
      fetchAnnouncements();
      // Reset history state when modal opens
      dispatch({ type: 'RESET_HISTORY' });
      dispatch({ type: 'SET_TAB', tab: 'unread' });
    }
  }, [isOpen, fetchAnnouncements]);

  // Lazy load history when tab is clicked
  const handleTabChange = (tab: TabType) => {
    dispatch({ type: 'SET_TAB', tab });
    if (tab === 'history' && !historyLoaded) {
      fetchHistory();
    }
  };

  const handleMarkAsRead = async (announcementId: string) => {
    try {
      dispatch({ type: 'MARK_READ_START', announcementId });
      await apiClient.post(`/api/user/announcements/${announcementId}/read`, {});

      dispatch({ type: 'MARK_READ_SUCCESS', announcementId });
      onCountChange?.(announcements.length - 1);
    } catch {
      dispatch({ type: 'MARK_READ_ERROR', error: 'Failed to mark announcement as read. Please try again.' });
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      dispatch({ type: 'MARK_ALL_READ_START' });
      await apiClient.post('/api/user/announcements/read-all', {});

      dispatch({ type: 'MARK_ALL_READ_SUCCESS' });
      onCountChange?.(0);
      onClose();
    } catch {
      dispatch({ type: 'MARK_ALL_READ_ERROR', error: 'Failed to mark all as read. Please try again.' });
    }
  };

  return (
    <Transition appear show={isOpen}>
      <Dialog as="div" onClose={onClose}>
        {/* Backdrop with blur */}
        <TransitionChild
          as="div"
          className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 transition-all"
          enter="transition ease-out duration-300"
          enterFrom="opacity-0 backdrop-blur-none"
          enterTo="opacity-100 backdrop-blur-sm"
          leave="transition ease-out duration-200"
          leaveFrom="opacity-100 backdrop-blur-sm"
          leaveTo="opacity-0 backdrop-blur-none"
          aria-hidden="true"
        />
        <TransitionChild
          as="div"
          className="fixed inset-0 z-50 overflow-hidden flex items-center my-4 justify-center px-4 sm:px-6"
          enter="transition ease-out duration-300"
          enterFrom="opacity-0 scale-95 translate-y-4"
          enterTo="opacity-100 scale-100 translate-y-0"
          leave="transition ease-in duration-200"
          leaveFrom="opacity-100 scale-100 translate-y-0"
          leaveTo="opacity-0 scale-95 translate-y-4"
        >
          <DialogPanel className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl ring-1 ring-gray-900/5 dark:ring-white/10 overflow-hidden max-w-2xl w-full max-h-[80vh] flex flex-col">
            {/* Modal header with gradient accent */}
            <div className="relative flex-shrink-0">
              {/* Subtle gradient accent bar */}
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 via-purple-500 to-violet-500" />

              <div className="px-6 pt-5 pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    {/* Announcement icon */}
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                      </svg>
                    </div>
                    <div>
                      <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Announcements
                      </Dialog.Title>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {activeTab === 'unread'
                          ? 'Stay updated with the latest news'
                          : 'Previously viewed announcements'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      onClick={onClose}
                    >
                      <span className="sr-only">Close</span>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mt-4 p-1 bg-gray-100 dark:bg-gray-700/50 rounded-lg" role="tablist" aria-label="Announcement views">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'unread'}
                    aria-controls={unreadPanelId}
                    onClick={() => handleTabChange('unread')}
                    className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all ${
                      activeTab === 'unread'
                        ? 'bg-white dark:bg-gray-800 text-violet-600 dark:text-violet-400 shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      Unread
                      {announcements.length > 0 && (
                        <Badge color="violet" size="sm" aria-label={`${announcements.length} unread`}>
                          {announcements.length}
                        </Badge>
                      )}
                    </span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'history'}
                    aria-controls={historyPanelId}
                    onClick={() => handleTabChange('history')}
                    className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all ${
                      activeTab === 'history'
                        ? 'bg-white dark:bg-gray-800 text-violet-600 dark:text-violet-400 shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      History
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Modal content */}
            <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900/50">
              {activeTab === 'unread' ? (
                // Unread tab content
                <div id={unreadPanelId} role="tabpanel">
                {error ? (
                  <div className="flex flex-col items-center justify-center py-16 px-6">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-400 to-rose-500 flex items-center justify-center shadow-lg shadow-red-500/25 mb-4">
                      <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <p className="text-base font-semibold text-gray-900 dark:text-gray-100">Something went wrong</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 text-center">{error}</p>
                    <button
                      type="button"
                      onClick={fetchAnnouncements}
                      className="mt-4 px-4 py-2 text-sm font-medium text-violet-600 hover:text-violet-700 bg-violet-100 hover:bg-violet-200 dark:bg-violet-900/30 dark:hover:bg-violet-900/50 rounded-lg transition-colors"
                    >
                      Try again
                    </button>
                  </div>
                ) : loading ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Spinner size="lg" trackClassName="border-violet-100 dark:border-violet-900/50" indicatorClassName="border-violet-500" />
                    <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading announcements...</p>
                  </div>
                ) : announcements.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-6">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-500/25 mb-4">
                      <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <p className="text-base font-semibold text-gray-900 dark:text-gray-100">All caught up!</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 text-center">
                      You've read all your announcements.<br />Check back later for updates.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 space-y-3">
                    {announcements.map((announcement) => {
                      const config = priorityConfig[announcement.priority];
                      const isMarking = markingRead === announcement.announcement_id;

                      return (
                        <div
                          key={announcement.announcement_id}
                          className={`relative rounded-xl border ${config.border} ${config.bg} p-4 transition-all hover:shadow-md ${isMarking ? 'opacity-50 scale-[0.98]' : ''}`}
                        >
                          {/* Priority indicator stripe */}
                          {announcement.priority !== 'normal' && (
                            <div className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${config.badge.split(' ')[0]}`} />
                          )}

                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0 pl-1">
                              <div className="flex items-center gap-2 mb-2">
                                {announcement.priority !== 'normal' && (
                                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${config.badge}`}>
                                    {config.label}
                                  </span>
                                )}
                                <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                  {formatDate(announcement.created_at)}
                                </span>
                              </div>
                              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                                {announcement.subject}
                              </h4>
                              <SafeHtmlRenderer
                                html={renderMarkdown(announcement.body)}
                                className="text-sm text-gray-600 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1"
                                preSanitized
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleMarkAsRead(announcement.announcement_id)}
                              disabled={isMarking}
                              className="flex-shrink-0 p-2 text-gray-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-all disabled:opacity-50"
                              title="Mark as read"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                </div>
              ) : (
                // History tab content
                <div id={historyPanelId} role="tabpanel">
                {historyError ? (
                  <div className="flex flex-col items-center justify-center py-16 px-6">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-400 to-rose-500 flex items-center justify-center shadow-lg shadow-red-500/25 mb-4">
                      <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <p className="text-base font-semibold text-gray-900 dark:text-gray-100">Something went wrong</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 text-center">{historyError}</p>
                    <button
                      type="button"
                      onClick={() => {
                        dispatch({ type: 'RESET_HISTORY' });
                        fetchHistory();
                      }}
                      className="mt-4 px-4 py-2 text-sm font-medium text-violet-600 hover:text-violet-700 bg-violet-100 hover:bg-violet-200 dark:bg-violet-900/30 dark:hover:bg-violet-900/50 rounded-lg transition-colors"
                    >
                      Try again
                    </button>
                  </div>
                ) : historyLoading ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Spinner size="lg" trackClassName="border-violet-100 dark:border-violet-900/50" indicatorClassName="border-violet-500" />
                    <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading history...</p>
                  </div>
                ) : historyAnnouncements.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-6">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center shadow-lg shadow-gray-500/25 mb-4">
                      <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <p className="text-base font-semibold text-gray-900 dark:text-gray-100">No history yet</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 text-center">
                      Announcements you've read<br />will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 space-y-3">
                    {historyAnnouncements.map((announcement) => {
                      const config = priorityConfig[announcement.priority];

                      return (
                        <div
                          key={announcement.announcement_id}
                          className={`relative rounded-xl border ${config.border} ${config.bg} p-4 opacity-75 hover:opacity-100 transition-opacity`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                {announcement.priority !== 'normal' && (
                                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${config.badge}`}>
                                    {config.label}
                                  </span>
                                )}
                                <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                  Read {formatDate(announcement.read_at)}
                                </span>
                              </div>
                              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                                {announcement.subject}
                              </h4>
                              <SafeHtmlRenderer
                                html={renderMarkdown(announcement.body)}
                                className="text-sm text-gray-600 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1"
                                preSanitized
                              />
                            </div>
                            {/* Read indicator */}
                            <div className="flex-shrink-0 p-2">
                              <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                </div>
              )}
            </div>

            {/* Footer with Mark all as read button */}
            {activeTab === 'unread' && announcements.length > 0 && (
              <div className="flex-shrink-0 px-6 py-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={handleMarkAllAsRead}
                  disabled={markingAllRead}
                  className="w-full px-4 py-2.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 rounded-lg transition-colors disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {markingAllRead ? (
                    <>
                      <Spinner
                        sizeClassName="w-4 h-4"
                        borderClassName="border-2"
                        trackClassName="border-current opacity-25"
                        indicatorClassName="border-current opacity-75"
                      />
                      Marking all as read...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Mark all as read
                    </>
                  )}
                </button>
              </div>
            )}
          </DialogPanel>
        </TransitionChild>
      </Dialog>
    </Transition>
  );
}
