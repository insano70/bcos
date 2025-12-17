/**
 * User Detail Modal Component
 *
 * Displays full security profile for an at-risk user.
 * Features:
 * - User info and current status
 * - Risk score and factors
 * - Recent login history
 * - Admin actions (unlock, clear attempts, flag)
 */

'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import {
  getRiskCategory,
  getRiskIndicator,
  getRiskScoreBgColor,
  getRiskScoreColor,
} from '@/lib/monitoring/risk-score';
import type { AtRiskUser, LoginHistoryResponse } from '@/lib/monitoring/types';
import ConfirmModal from './confirm-modal';
import { useToast } from './toast';
import { Spinner } from '@/components/ui/spinner';

interface UserDetailModalProps {
  user: AtRiskUser | null;
  isOpen: boolean;
  onClose: () => void;
  onUserUpdated?: () => void;
}

type ConfirmAction = {
  type: 'unlock' | 'clear' | 'flag' | 'unflag';
  userId: string;
  userEmail: string;
} | null;

export default function UserDetailModal({
  user,
  isOpen,
  onClose,
  onUserUpdated,
}: UserDetailModalProps) {
  const [loginHistory, setLoginHistory] = useState<LoginHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const { showToast } = useToast();

  // Fetch login history when modal opens
  useEffect(() => {
    if (isOpen && user) {
      setLoading(true);
      apiClient
        .get(`/api/admin/monitoring/login-history?userId=${user.userId}&limit=20`)
        .then((response) => {
          setLoginHistory(response as LoginHistoryResponse);
        })
        .catch(() => {
          // Error handled via empty state display
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, user]);

  // Action handlers
  const handleUnlockAccount = () => {
    if (!user) return;
    setConfirmAction({
      type: 'unlock',
      userId: user.userId,
      userEmail: user.email,
    });
  };

  const handleClearAttempts = () => {
    if (!user) return;
    setConfirmAction({
      type: 'clear',
      userId: user.userId,
      userEmail: user.email,
    });
  };

  const handleToggleFlag = () => {
    if (!user) return;
    setConfirmAction({
      type: user.suspiciousActivity ? 'unflag' : 'flag',
      userId: user.userId,
      userEmail: user.email,
    });
  };

  const handleConfirmAction = async (reason?: string) => {
    if (!confirmAction) return;

    setActionLoading(true);

    try {
      let endpoint = '';
      let body: Record<string, unknown> = {};

      switch (confirmAction.type) {
        case 'unlock':
          endpoint = `/api/admin/monitoring/users/${confirmAction.userId}/unlock`;
          body = { reason: reason || 'Admin review completed' };
          break;
        case 'clear':
          endpoint = `/api/admin/monitoring/users/${confirmAction.userId}/clear-attempts`;
          body = { reason: reason || 'Admin cleared attempts' };
          break;
        case 'flag':
          endpoint = `/api/admin/monitoring/users/${confirmAction.userId}/flag`;
          body = { flag: true, reason: reason || 'Admin flagged for review' };
          break;
        case 'unflag':
          endpoint = `/api/admin/monitoring/users/${confirmAction.userId}/flag`;
          body = { flag: false, reason: reason || 'Admin cleared flag' };
          break;
      }

      await apiClient.post(endpoint, body);

      // Show success toast
      const successMessages = {
        unlock: 'Account unlocked successfully',
        clear: 'Failed attempts cleared',
        flag: 'User flagged for review',
        unflag: 'User flag cleared',
      };

      showToast({
        type: 'success',
        message: successMessages[confirmAction.type],
        duration: 5000,
      });

      // Refresh parent data
      if (onUserUpdated) {
        onUserUpdated();
      }

      // Close modal and confirmation
      setConfirmAction(null);
      onClose();
    } catch (error) {
      showToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Action failed. Please try again.',
        duration: 7000,
      });

      setConfirmAction(null);
    } finally {
      setActionLoading(false);
    }
  };

  if (!isOpen || !user) return null;

  const now = new Date();
  const isLocked = user.lockedUntil && new Date(user.lockedUntil) > now;
  const category = getRiskCategory(user.riskScore);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      ></div>

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                User Security Profile
              </h2>
              <button type="button" onClick={onClose}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-4 overflow-y-auto max-h-[calc(90vh-200px)]">
            {/* User Info */}
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {user.firstName} {user.lastName}
                </div>
                <span
                  className={`px-3 py-1 ${getRiskScoreBgColor(user.riskScore)} ${getRiskScoreColor(user.riskScore)} text-sm font-medium rounded`}
                >
                  {getRiskIndicator(category)} Risk: {user.riskScore}
                </span>
                {isLocked && (
                  <span className="px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 text-sm font-medium rounded">
                    🔒 Account Locked
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">{user.email}</div>
            </div>

            {/* Risk Factors */}
            {user.riskFactors.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Risk Factors:
                </h4>
                <ul className="space-y-1">
                  {user.riskFactors.map((factor) => (
                    <li
                      key={factor}
                      className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2"
                    >
                      <span className="text-red-500">•</span>
                      {factor}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Security Stats */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
                <div className="text-xs text-gray-500 dark:text-gray-400">Failed Attempts</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {user.failedAttempts}
                </div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
                <div className="text-xs text-gray-500 dark:text-gray-400">Last 24h</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {user.recentAttempts24h}
                </div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
                <div className="text-xs text-gray-500 dark:text-gray-400">Unique IPs (7d)</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {user.uniqueIPs7d}
                </div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
                <div className="text-xs text-gray-500 dark:text-gray-400">Status</div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {isLocked
                    ? '🔒 Locked'
                    : user.suspiciousActivity
                      ? '⚠️ Suspicious'
                      : '👁 Monitoring'}
                </div>
              </div>
            </div>

            {/* Login History */}
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Recent Login Attempts (Last 20):
              </h4>
              {loading ? (
                <div className="text-center py-4">
                  <Spinner size="sm" className="mx-auto" />
                </div>
              ) : loginHistory && loginHistory.attempts.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {loginHistory.attempts.map((attempt) => (
                    <div
                      key={attempt.attemptId}
                      className={`p-2 rounded text-sm ${
                        attempt.success
                          ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                          : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div
                            className={`font-medium ${
                              attempt.success
                                ? 'text-green-800 dark:text-green-200'
                                : 'text-red-800 dark:text-red-200'
                            }`}
                          >
                            {attempt.success ? '✓ Success' : '✗ Failed'}
                            {attempt.failureReason && ` - ${attempt.failureReason}`}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            {new Date(attempt.attemptedAt).toLocaleString()} • {attempt.ipAddress}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                  No login attempts found
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-600 dark:text-gray-400">User ID: {user.userId}</div>
              <div className="flex gap-2">
                {/* Unlock Account Button */}
                {isLocked && (
                  <button type="button" onClick={handleUnlockAccount}
                    disabled={actionLoading}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    🔓 Unlock Account
                  </button>
                )}

                {/* Clear Failed Attempts Button */}
                {user.failedAttempts > 0 && (
                  <button type="button" onClick={handleClearAttempts}
                    disabled={actionLoading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    Clear Attempts ({user.failedAttempts})
                  </button>
                )}

                {/* Flag/Unflag Button */}
                <button type="button" onClick={handleToggleFlag}
                  disabled={actionLoading}
                  className={`px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 ${
                    user.suspiciousActivity
                      ? 'bg-gray-600 text-white hover:bg-gray-700'
                      : 'bg-amber-600 text-white hover:bg-amber-700'
                  }`}
                >
                  {user.suspiciousActivity ? '✓ Unflag User' : '⚠️ Flag as Suspicious'}
                </button>

                {/* Close Button */}
                <button type="button" onClick={onClose}
                  disabled={actionLoading}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmAction !== null}
        title={getConfirmTitle(confirmAction)}
        message={getConfirmMessage(confirmAction)}
        confirmText={getConfirmText(confirmAction)}
        confirmVariant={getConfirmVariant(confirmAction)}
        requireReason={true}
        reasonPlaceholder={getReasonPlaceholder(confirmAction)}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}

// Helper functions for confirmation modal
function getConfirmTitle(action: ConfirmAction): string {
  if (!action) return '';
  switch (action.type) {
    case 'unlock':
      return 'Unlock User Account';
    case 'clear':
      return 'Clear Failed Login Attempts';
    case 'flag':
      return 'Flag User as Suspicious';
    case 'unflag':
      return 'Remove Suspicious Flag';
  }
}

function getConfirmMessage(action: ConfirmAction): string {
  if (!action) return '';
  switch (action.type) {
    case 'unlock':
      return `Are you sure you want to unlock the account for ${action.userEmail}? This will reset failed login attempts and remove the account lock.`;
    case 'clear':
      return `Are you sure you want to clear failed login attempts for ${action.userEmail}? The account will remain locked if it was locked.`;
    case 'flag':
      return `Are you sure you want to flag ${action.userEmail} as suspicious? This will mark the account for additional monitoring.`;
    case 'unflag':
      return `Are you sure you want to remove the suspicious flag from ${action.userEmail}?`;
  }
}

function getConfirmText(action: ConfirmAction): string {
  if (!action) return '';
  switch (action.type) {
    case 'unlock':
      return 'Unlock Account';
    case 'clear':
      return 'Clear Attempts';
    case 'flag':
      return 'Flag User';
    case 'unflag':
      return 'Unflag User';
  }
}

function getConfirmVariant(action: ConfirmAction): 'danger' | 'warning' | 'primary' {
  if (!action) return 'primary';
  switch (action.type) {
    case 'unlock':
      return 'warning';
    case 'clear':
      return 'primary';
    case 'flag':
      return 'warning';
    case 'unflag':
      return 'primary';
  }
}

function getReasonPlaceholder(action: ConfirmAction): string {
  if (!action) return '';
  switch (action.type) {
    case 'unlock':
      return 'Why are you unlocking this account? (e.g., "Admin review completed, legitimate user")';
    case 'clear':
      return 'Why are you clearing failed attempts? (e.g., "User verified via phone")';
    case 'flag':
      return 'Why are you flagging this user? (e.g., "Unusual activity pattern detected")';
    case 'unflag':
      return 'Why are you removing the flag? (e.g., "False positive, verified legitimate")';
  }
}
