import { SelectedItemsProvider } from '@/app/selected-items-context';
import MetadataManagementContent from './metadata-content';

export const metadata = {
  title: 'Data Explorer Metadata',
  description: 'Manage table and column metadata for Data Explorer',
};

export default function MetadataManagementPage() {
  return (
    <SelectedItemsProvider>
      <MetadataManagementContent />
    </SelectedItemsProvider>
  );
}
