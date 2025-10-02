import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SelectedItemsProvider } from '@/app/selected-items-context';
import { ProtectedComponent } from '@/components/rbac/protected-component';
import DataSourceColumnsContent from './data-source-columns-content';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export const metadata: Metadata = {
  title: 'Data Source Columns - BCOS',
  description: 'Configure columns for data sources',
};

export default async function DataSourceColumnsPage({ params }: PageProps) {
  const resolvedParams = await params;
  const dataSourceId = parseInt(resolvedParams.id, 10);

  if (Number.isNaN(dataSourceId)) {
    notFound();
  }

  return (
    <ProtectedComponent permission="data-sources:read:organization">
      <SelectedItemsProvider>
        <DataSourceColumnsContent dataSourceId={dataSourceId} />
      </SelectedItemsProvider>
    </ProtectedComponent>
  );
}
