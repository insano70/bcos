import AdvancedDashboardBuilder from '@/components/charts/dashboard-builder-advanced';

export const metadata = {
  title: 'Dashboard Builder',
  description: 'Create multi-chart dashboards with drag-and-drop layout',
};

export default function DashboardBuilderPage() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
      <AdvancedDashboardBuilder />
    </div>
  );
}
