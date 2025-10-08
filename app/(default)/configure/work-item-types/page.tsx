import type { Metadata } from 'next';
import { SelectedItemsProvider } from '@/app/selected-items-context';
import WorkItemTypesContent from './work-item-types-content';

export const metadata: Metadata = {
  title: 'Work Item Types - BCOS',
  description: 'Manage work item types and their configurations',
};

export default function WorkItemTypesPage() {
  return (
    <SelectedItemsProvider>
      <WorkItemTypesContent />
    </SelectedItemsProvider>
  );
}
