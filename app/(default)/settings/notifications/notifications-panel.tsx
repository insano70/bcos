'use client';

import { useState } from 'react';
import Toast from '@/components/toast';

export default function NotificationsPanel() {
  // Work Item Notification Preferences
  const [notifyStatusChanges, setNotifyStatusChanges] = useState<boolean>(true);
  const [notifyComments, setNotifyComments] = useState<boolean>(true);
  const [notifyAssignments, setNotifyAssignments] = useState<boolean>(true);
  const [notifyDueDate, setNotifyDueDateChanges] = useState<boolean>(true);

  // General Notification Preferences
  const [emailEnabled, setEmailEnabled] = useState<boolean>(true);
  const [dailyDigest, setDailyDigest] = useState<boolean>(false);

  // Toast state
  const [showToast, setShowToast] = useState(false);

  const handleSave = async () => {
    // TODO: Implement API endpoint to save user's default notification preferences
    // For now, just show success toast
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  return (
    <div className="grow">
      {/* Panel body */}
      <div className="p-6 space-y-6">
        <div>
          <h2 className="text-2xl text-gray-800 dark:text-gray-100 font-bold mb-2">
            Notification Preferences
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Control how and when you receive notifications about work items you're watching.
          </p>
        </div>

        {/* Work Item Notifications */}
        <section>
          <h3 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-bold mb-1">
            Work Item Notifications
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            These settings apply to work items you watch. You can customize preferences for individual work items from their detail pages.
          </p>
          <ul className="space-y-0">
            <li className="flex justify-between items-center py-3 border-b border-gray-200 dark:border-gray-700/60">
              {/* Left */}
              <div className="flex-1 pr-4">
                <div className="text-gray-800 dark:text-gray-100 font-semibold">
                  Status Changes
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Notify me when work item status changes (e.g., In Progress → Completed)
                </div>
              </div>
              {/* Right */}
              <div className="flex items-center ml-4 flex-shrink-0">
                <div className="text-sm text-gray-400 dark:text-gray-500 italic mr-2">
                  {notifyStatusChanges ? 'On' : 'Off'}
                </div>
                <div className="form-switch">
                  <input
                    type="checkbox"
                    id="notify_status_changes"
                    className="sr-only"
                    checked={notifyStatusChanges}
                    onChange={() => setNotifyStatusChanges(!notifyStatusChanges)}
                  />
                  <label htmlFor="notify_status_changes">
                    <span className="bg-white dark:bg-gray-700 shadow-sm" aria-hidden="true"></span>
                    <span className="sr-only">Toggle status change notifications</span>
                  </label>
                </div>
              </div>
            </li>

            <li className="flex justify-between items-center py-3 border-b border-gray-200 dark:border-gray-700/60">
              {/* Left */}
              <div className="flex-1 pr-4">
                <div className="text-gray-800 dark:text-gray-100 font-semibold">
                  Comments
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Notify me when someone comments on a work item I'm watching
                </div>
              </div>
              {/* Right */}
              <div className="flex items-center ml-4 flex-shrink-0">
                <div className="text-sm text-gray-400 dark:text-gray-500 italic mr-2">
                  {notifyComments ? 'On' : 'Off'}
                </div>
                <div className="form-switch">
                  <input
                    type="checkbox"
                    id="notify_comments"
                    className="sr-only"
                    checked={notifyComments}
                    onChange={() => setNotifyComments(!notifyComments)}
                  />
                  <label htmlFor="notify_comments">
                    <span className="bg-white dark:bg-gray-700 shadow-sm" aria-hidden="true"></span>
                    <span className="sr-only">Toggle comment notifications</span>
                  </label>
                </div>
              </div>
            </li>

            <li className="flex justify-between items-center py-3 border-b border-gray-200 dark:border-gray-700/60">
              {/* Left */}
              <div className="flex-1 pr-4">
                <div className="text-gray-800 dark:text-gray-100 font-semibold">
                  Assignment Changes
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Notify me when work items are assigned or reassigned
                </div>
              </div>
              {/* Right */}
              <div className="flex items-center ml-4 flex-shrink-0">
                <div className="text-sm text-gray-400 dark:text-gray-500 italic mr-2">
                  {notifyAssignments ? 'On' : 'Off'}
                </div>
                <div className="form-switch">
                  <input
                    type="checkbox"
                    id="notify_assignments"
                    className="sr-only"
                    checked={notifyAssignments}
                    onChange={() => setNotifyAssignments(!notifyAssignments)}
                  />
                  <label htmlFor="notify_assignments">
                    <span className="bg-white dark:bg-gray-700 shadow-sm" aria-hidden="true"></span>
                    <span className="sr-only">Toggle assignment notifications</span>
                  </label>
                </div>
              </div>
            </li>

            <li className="flex justify-between items-center py-3 border-b border-gray-200 dark:border-gray-700/60">
              {/* Left */}
              <div className="flex-1 pr-4">
                <div className="text-gray-800 dark:text-gray-100 font-semibold">
                  Due Date Changes
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Notify me when due dates are set or changed
                </div>
              </div>
              {/* Right */}
              <div className="flex items-center ml-4 flex-shrink-0">
                <div className="text-sm text-gray-400 dark:text-gray-500 italic mr-2">
                  {notifyDueDate ? 'On' : 'Off'}
                </div>
                <div className="form-switch">
                  <input
                    type="checkbox"
                    id="notify_due_date"
                    className="sr-only"
                    checked={notifyDueDate}
                    onChange={() => setNotifyDueDateChanges(!notifyDueDate)}
                  />
                  <label htmlFor="notify_due_date">
                    <span className="bg-white dark:bg-gray-700 shadow-sm" aria-hidden="true"></span>
                    <span className="sr-only">Toggle due date notifications</span>
                  </label>
                </div>
              </div>
            </li>
          </ul>
        </section>

        {/* Delivery Settings */}
        <section>
          <h3 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-bold mb-1">
            Delivery Settings
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Choose how you want to receive notifications.
          </p>
          <ul className="space-y-0">
            <li className="flex justify-between items-center py-3 border-b border-gray-200 dark:border-gray-700/60">
              {/* Left */}
              <div className="flex-1 pr-4">
                <div className="text-gray-800 dark:text-gray-100 font-semibold">
                  Email Notifications
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Receive notifications via email
                </div>
              </div>
              {/* Right */}
              <div className="flex items-center ml-4 flex-shrink-0">
                <div className="text-sm text-gray-400 dark:text-gray-500 italic mr-2">
                  {emailEnabled ? 'On' : 'Off'}
                </div>
                <div className="form-switch">
                  <input
                    type="checkbox"
                    id="email_enabled"
                    className="sr-only"
                    checked={emailEnabled}
                    onChange={() => setEmailEnabled(!emailEnabled)}
                  />
                  <label htmlFor="email_enabled">
                    <span className="bg-white dark:bg-gray-700 shadow-sm" aria-hidden="true"></span>
                    <span className="sr-only">Toggle email notifications</span>
                  </label>
                </div>
              </div>
            </li>

            <li className="flex justify-between items-center py-3 border-b border-gray-200 dark:border-gray-700/60">
              {/* Left */}
              <div className="flex-1 pr-4">
                <div className="text-gray-800 dark:text-gray-100 font-semibold">
                  Daily Digest
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Receive a daily summary of all notifications instead of individual emails
                </div>
              </div>
              {/* Right */}
              <div className="flex items-center ml-4 flex-shrink-0">
                <div className="text-sm text-gray-400 dark:text-gray-500 italic mr-2">
                  {dailyDigest ? 'On' : 'Off'}
                </div>
                <div className="form-switch">
                  <input
                    type="checkbox"
                    id="daily_digest"
                    className="sr-only"
                    checked={dailyDigest}
                    onChange={() => setDailyDigest(!dailyDigest)}
                    disabled={!emailEnabled}
                  />
                  <label htmlFor="daily_digest" className={!emailEnabled ? 'opacity-50 cursor-not-allowed' : ''}>
                    <span className="bg-white dark:bg-gray-700 shadow-sm" aria-hidden="true"></span>
                    <span className="sr-only">Toggle daily digest</span>
                  </label>
                </div>
              </div>
            </li>
          </ul>
        </section>

        {/* Info Box */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex">
            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-1">
                Per-Item Customization
              </h4>
              <p className="text-sm text-blue-800 dark:text-blue-300">
                You can customize notification preferences for individual work items from their detail pages. These settings serve as defaults for new work items you watch.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Panel footer */}
      <footer>
        <div className="flex flex-col px-6 py-5 border-t border-gray-200 dark:border-gray-700/60">
          <div className="flex self-end">
            <button
              type="button"
              className="btn dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300"
              onClick={() => window.location.reload()}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white ml-3"
              onClick={handleSave}
            >
              Save Changes
            </button>
          </div>
        </div>
      </footer>

      {/* Success Toast */}
      {showToast && (
        <Toast type="success" open={showToast} setOpen={setShowToast}>
          Notification preferences saved successfully
        </Toast>
      )}
    </div>
  );
}
