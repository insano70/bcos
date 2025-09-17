import ChartTemplateManager from '@/components/charts/chart-template-manager';

export const metadata = {
  title: 'Chart Templates',
  description: 'Manage chart templates and create charts from industry-specific presets',
};

export default function ChartTemplatesPage() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
      <ChartTemplateManager />
    </div>
  );
}
