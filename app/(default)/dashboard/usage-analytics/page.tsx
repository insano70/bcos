import UsageAnalyticsDashboard from '@/components/charts/usage-analytics-dashboard';

export const metadata = {
  title: 'Usage Analytics',
  description: 'Monitor chart access patterns and system performance',
};

export default function UsageAnalyticsPage() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
      <UsageAnalyticsDashboard />
    </div>
  );
}
