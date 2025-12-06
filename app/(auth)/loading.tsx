/**
 * Auth Route Group Loading State
 *
 * This loading component is shown during route transitions within the (auth) route group.
 * It provides a minimal, clean loading experience consistent with auth page styling.
 */

export default function AuthLoading() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900 dark:border-gray-100 mb-4"></div>
        <p className="text-sm text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    </div>
  );
}





