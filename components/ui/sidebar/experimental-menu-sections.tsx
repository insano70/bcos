'use client';

/**
 * Experimental Menu Sections
 *
 * **IMPORTANT: These are UI reference components ONLY - NON-FUNCTIONAL**
 *
 * This file contains menu sections for experimental features that exist purely
 * for UI/UX design reference. None of these features are implemented or functional.
 *
 * These sections demonstrate various menu layouts and patterns but should NOT be
 * treated as production code.
 *
 * Sections included:
 * - E-Commerce (customers, orders, invoices, shop, products)
 * - Community (users, forums, meetups)
 * - Finance (cards, transactions, invoices)
 * - Job Board
 * - Tasks
 * - Messages
 * - Inbox
 * - Calendar
 * - Campaigns
 * - Settings
 * - Utility
 *
 * If you need to activate any of these features for production use, they will
 * require full implementation including:
 * - Backend APIs
 * - Database schemas
 * - RBAC permissions
 * - Business logic
 * - Data validation
 * - Testing
 */

import { useSelectedLayoutSegments } from 'next/navigation';
import { useWindowWidth } from '@/components/utils/use-window-width';
import { useAppProvider } from '@/app/app-provider';
import SidebarLinkGroup from '../sidebar-link-group';
import SidebarLink from '../sidebar-link';

export function ExperimentalMenuSections() {
  const segments = useSelectedLayoutSegments();
  const { sidebarExpanded, setSidebarExpanded } = useAppProvider();
  const breakpoint = useWindowWidth();
  const expandOnly = !sidebarExpanded && breakpoint && breakpoint >= 1024 && breakpoint < 1536;

  return (
    <>
      {/* UI REFERENCE ONLY - NON-FUNCTIONAL SECTIONS BELOW */}

      {/* Placeholder for Experimental E-Commerce Section */}
      <div>
        <h3 className="text-xs uppercase text-gray-400 dark:text-gray-500 font-semibold pl-3">
          <span className="hidden lg:block lg:sidebar-expanded:hidden 2xl:hidden text-center w-6" aria-hidden="true">
            •••
          </span>
          <span className="lg:hidden lg:sidebar-expanded:block 2xl:block">
            Experimental <span className="text-xs">(UI Only)</span>
          </span>
        </h3>
        <ul className="mt-3">
          <li className="pl-4 pr-3 py-2 rounded-lg mb-0.5 last:mb-0 opacity-50 cursor-not-allowed">
            <div className="flex items-center">
              <svg
                className="shrink-0 fill-current text-gray-400 dark:text-gray-500"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 16 16"
              >
                <path d="M2.5 8a5.5 5.5 0 0 1 8.25-4.764.5.5 0 0 0 .5-.866A6.5 6.5 0 1 0 14.5 8a.5.5 0 0 0-1 0 5.5 5.5 0 1 1-11 0Z" />
                <path d="M15.354 3.354 8.707 10l-3.36-3.36a.5.5 0 1 0-.708.707l3.714 3.714a.5.5 0 0 0 .707 0l7-7a.5.5 0 0 0-.707-.707Z" />
              </svg>
              <span className="text-sm font-medium ml-4 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">
                E-Commerce (UI Reference)
              </span>
            </div>
          </li>

          <li className="pl-4 pr-3 py-2 rounded-lg mb-0.5 last:mb-0 opacity-50 cursor-not-allowed">
            <div className="flex items-center">
              <svg
                className="shrink-0 fill-current text-gray-400 dark:text-gray-500"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 16 16"
              >
                <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8Zm0 10c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2Z" />
              </svg>
              <span className="text-sm font-medium ml-4 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">
                Community (UI Reference)
              </span>
            </div>
          </li>

          <li className="pl-4 pr-3 py-2 rounded-lg mb-0.5 last:mb-0 opacity-50 cursor-not-allowed">
            <div className="flex items-center">
              <svg
                className="shrink-0 fill-current text-gray-400 dark:text-gray-500"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 16 16"
              >
                <path d="M13 0H3C1.3 0 0 1.3 0 3v10c0 1.7 1.3 3 3 3h10c1.7 0 3-1.3 3-3V3c0-1.7-1.3-3-3-3ZM4 11H2V9h2v2Zm0-4H2V5h2v2Zm0-4H2V1h2v2Zm6 8H6V9h4v2Zm0-4H6V5h4v2Zm0-4H6V1h4v2Zm4 8h-2V9h2v2Zm0-4h-2V5h2v2Zm0-4h-2V1h2v2Z" />
              </svg>
              <span className="text-sm font-medium ml-4 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">
                Finance (UI Reference)
              </span>
            </div>
          </li>
        </ul>
      </div>

      {/* More Experimental Sections */}
      <div>
        <h3 className="text-xs uppercase text-gray-400 dark:text-gray-500 font-semibold pl-3">
          <span className="hidden lg:block lg:sidebar-expanded:hidden 2xl:hidden text-center w-6" aria-hidden="true">
            •••
          </span>
          <span className="lg:hidden lg:sidebar-expanded:block 2xl:block">More <span className="text-xs">(UI Only)</span></span>
        </h3>
        <ul className="mt-3">
          {['Job Board', 'Tasks', 'Messages', 'Inbox', 'Calendar', 'Campaigns', 'Settings', 'Utility'].map((item) => (
            <li key={item} className="pl-4 pr-3 py-2 rounded-lg mb-0.5 last:mb-0 opacity-50 cursor-not-allowed">
              <div className="flex items-center">
                <svg
                  className="shrink-0 fill-current text-gray-400 dark:text-gray-500"
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                >
                  <circle cx="8" cy="8" r="2" />
                </svg>
                <span className="text-sm font-medium ml-4 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">
                  {item}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
