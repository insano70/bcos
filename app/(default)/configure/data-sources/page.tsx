export const metadata = {
  title: 'Data Sources - BCOS',
  description: 'Manage data sources for analytics and reporting',
};

import { SelectedItemsProvider } from '@/app/selected-items-context';
import { ProtectedComponent } from '@/components/rbac/protected-component';
import DataSourcesContent from './data-sources-content';

export default function DataSources() {
  return (
    <ProtectedComponent permission="data-sources:read:organization">
      <SelectedItemsProvider>
        <DataSourcesContent />
      </SelectedItemsProvider>
    </ProtectedComponent>
  );
}
