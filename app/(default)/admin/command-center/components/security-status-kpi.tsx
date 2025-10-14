/**
 * Security Status KPI Card
 *
 * Displays security threat count and status.
 * Aggregates failed logins, rate limit blocks, CSRF blocks, and at-risk users.
 *
 * Status:
 * - Green: 0 threats
 * - Yellow: 1-5 threats
 * - Red: > 5 threats
 */

interface SecurityStatusKPIProps {
  security: {
    failedLogins: number;
    rateLimitBlocks: number;
    csrfBlocks: number;
    suspiciousUsers: number;
    lockedAccounts: number;
  };
}

export default function SecurityStatusKPI({ security }: SecurityStatusKPIProps) {
  // Calculate total threat count
  const totalThreats =
    security.failedLogins +
    security.rateLimitBlocks +
    security.csrfBlocks +
    security.suspiciousUsers;

  // Determine status
  const getStatusColor = () => {
    if (totalThreats === 0) return 'text-green-600 dark:text-green-400';
    if (totalThreats <= 5) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getBgColor = () => {
    if (totalThreats === 0) return 'bg-green-100 dark:bg-green-900';
    if (totalThreats <= 5) return 'bg-amber-100 dark:bg-amber-900';
    return 'bg-red-100 dark:bg-red-900';
  };

  const getStatusIcon = () => {
    if (totalThreats === 0) return '✓';
    if (totalThreats <= 5) return '⚠';
    return '🚨';
  };

  const getStatusText = () => {
    if (totalThreats === 0) return 'OK';
    if (totalThreats <= 5) return 'Monitoring';
    return 'Alert';
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
      {/* Header */}
      <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Security Status</div>

      {/* Threat Count Display */}
      <div className="flex items-center gap-3 mb-3">
        {totalThreats === 0 ? (
          <div className="text-4xl font-bold text-green-600 dark:text-green-400">{getStatusText()}</div>
        ) : (
          <div className={`text-4xl font-bold ${getStatusColor()}`}>{totalThreats}</div>
        )}
        <div
          className={`h-12 w-12 rounded-full ${getBgColor()} flex items-center justify-center`}
        >
          <span className={`text-2xl ${getStatusColor()}`}>{getStatusIcon()}</span>
        </div>
      </div>

      {/* Status Text */}
      <div className={`text-sm font-medium ${getStatusColor()} mb-3`}>
        {totalThreats === 0 ? 'No threats detected' : `${totalThreats} ${totalThreats === 1 ? 'threat' : 'threats'} detected`}
      </div>

      {/* Expandable Breakdown */}
      {totalThreats > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 font-medium">
            View breakdown
          </summary>
          <div className="mt-2 space-y-1 text-xs text-gray-600 dark:text-gray-400">
            {security.failedLogins > 0 && (
              <div className="flex justify-between">
                <span>Failed Logins:</span>
                <span className="font-medium">{security.failedLogins}</span>
              </div>
            )}
            {security.rateLimitBlocks > 0 && (
              <div className="flex justify-between">
                <span>Rate Limit Blocks:</span>
                <span className="font-medium">{security.rateLimitBlocks}</span>
              </div>
            )}
            {security.csrfBlocks > 0 && (
              <div className="flex justify-between">
                <span>CSRF Blocks:</span>
                <span className="font-medium">{security.csrfBlocks}</span>
              </div>
            )}
            {security.suspiciousUsers > 0 && (
              <div className="flex justify-between">
                <span>Suspicious Users:</span>
                <span className="font-medium">{security.suspiciousUsers}</span>
              </div>
            )}
            {security.lockedAccounts > 0 && (
              <div className="flex justify-between">
                <span>Locked Accounts:</span>
                <span className="font-medium">{security.lockedAccounts}</span>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

