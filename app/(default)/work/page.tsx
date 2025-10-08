import { Metadata } from 'next';
import { SelectedItemsProvider } from '@/app/selected-items-context';
import WorkItemsContent from './work-items-content';

export const metadata: Metadata = {
  title: 'Work Items - BCOS',
  description: 'Manage work items and tasks',
};

export default function WorkItemsPage() {
  return (
    <SelectedItemsProvider>
      <WorkItemsContent />
    </SelectedItemsProvider>
  );
}
